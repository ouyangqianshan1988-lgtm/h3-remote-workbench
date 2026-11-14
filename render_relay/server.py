"""HTTP streaming relay. Only a secret-authenticated workstation can attach.

No accounts, prompts or results are stored here. Backend enforces account ownership.
One websocket per HTTP request provides backpressure without buffering video files.
"""
import asyncio
import hmac
import json
import os
import secrets
from pathlib import Path

from aiohttp import web, WSMsgType

HOP = {'host', 'connection', 'upgrade', 'keep-alive', 'transfer-encoding',
       'proxy-authenticate', 'proxy-authorization', 'te', 'trailer'}


def headers(items):
    blocked = HOP.copy()
    for k, v in items:
        if k.lower() == 'connection':
            blocked.update(x.strip().lower() for x in v.split(','))
    return [(k, v) for k, v in items if k.lower() not in blocked]


def make_app(key, static_root):
    if len(key) < 32:
        raise ValueError('RELAY_SECRET must contain at least 32 characters')
    control = None
    pending = {}
    active = set()

    def authenticate(request):
        supplied = request.headers.get('Authorization', '').removeprefix('Bearer ')
        if not hmac.compare_digest(supplied, key):
            raise web.HTTPUnauthorized()

    async def health(request):
        return web.json_response({'ok': True, 'workstation_connected':
                                  control is not None and not control.closed})

    async def connect(request):
        nonlocal control
        authenticate(request)
        if control is not None and not control.closed:
            raise web.HTTPConflict(text='Workstation already connected')
        ws = web.WebSocketResponse(heartbeat=30, max_msg_size=65536)
        await ws.prepare(request)
        control = ws
        try:
            async for _ in ws:
                pass
        finally:
            if control is ws:
                control = None
            for future in list(pending.values()):
                if not future.done():
                    future.set_exception(ConnectionError('Workstation disconnected'))
        return ws

    async def stream(request):
        authenticate(request)
        future = pending.get(request.match_info['id'])
        if future is None or future.done():
            raise web.HTTPNotFound()
        ws = web.WebSocketResponse(heartbeat=30, max_msg_size=1024 * 1024)
        await ws.prepare(request)
        finished = asyncio.Event()
        future.set_result((ws, finished))
        await finished.wait()
        await ws.close()
        return ws

    async def proxy(request):
        if request.path == '/config.js':
            return web.Response(text="window.PORTAL_API = '';\n", content_type='application/javascript',
                                headers={'Cache-Control': 'no-store'})
        if request.path in ('/', '/index.html', '/app.js', '/style.css'):
            return web.FileResponse(static_root / (request.path.strip('/') or 'index.html'),
                                    headers={'Cache-Control': 'no-store'})
        if not (request.path.startswith('/api/') or request.path.startswith('/files/')):
            raise web.HTTPNotFound()
        if request.method not in ('GET', 'HEAD', 'POST', 'DELETE', 'OPTIONS'):
            raise web.HTTPMethodNotAllowed(request.method, ['GET', 'HEAD', 'POST', 'DELETE', 'OPTIONS'])
        if control is None or control.closed:
            return web.json_response({'error': '工作站未连接，请在电脑上启动原版工作站。'}, status=503)
        if len(active) >= 32:
            return web.json_response({'error': '连接繁忙，请稍后重试'}, status=503)
        if request.content_length and request.content_length > 96 * 1024 * 1024:
            raise web.HTTPRequestEntityTooLarge(max_size=96 * 1024 * 1024, actual_size=request.content_length)
        ident = secrets.token_hex(16)
        future = asyncio.get_running_loop().create_future()
        pending[ident] = future
        active.add(ident)
        ws = finished = sender = response = None
        try:
            forward = headers(list(request.headers.items()))
            forward = [(k, v) for k, v in forward if k.lower() not in ('x-forwarded-proto', 'x-forwarded-host')]
            forward.extend([('X-Forwarded-Proto', 'https'), ('X-Forwarded-Host', request.host)])
            await control.send_json({'id': ident, 'method': request.method,
                                     'path': request.raw_path, 'headers': forward})
            ws, finished = await asyncio.wait_for(future, 20)

            async def send_body():
                total = 0
                async for chunk in request.content.iter_chunked(65536):
                    total += len(chunk)
                    if total > 96 * 1024 * 1024:
                        await ws.close()
                        raise ValueError('Upload too large')
                    await ws.send_bytes(chunk)
                await ws.send_str('end')

            sender = asyncio.create_task(send_body())
            first = await asyncio.wait_for(ws.receive(), 180)
            if first.type != WSMsgType.TEXT:
                raise ConnectionError('No backend response')
            meta = json.loads(first.data)
            response = web.StreamResponse(status=meta['status'], headers=headers(meta['headers']))
            response.headers['Cache-Control'] = 'no-store'
            await response.prepare(request)
            async for message in ws:
                if message.type == WSMsgType.BINARY:
                    await response.write(message.data)
                elif message.type == WSMsgType.TEXT and message.data == 'end':
                    await response.write_eof()
                    return response
                else:
                    break
            raise ConnectionError('Response interrupted')
        except (ConnectionError, asyncio.TimeoutError, OSError, ValueError):
            if response is not None and response.prepared:
                if request.transport:
                    request.transport.close()
                return response
            return web.json_response({'error': '工作站连接中断，请稍后重试。'}, status=502)
        finally:
            pending.pop(ident, None)
            active.discard(ident)
            if sender:
                sender.cancel()
                await asyncio.gather(sender, return_exceptions=True)
            if finished:
                finished.set()

    app = web.Application(client_max_size=96 * 1024 * 1024)
    app.router.add_get('/healthz', health)
    app.router.add_get('/_relay/control', connect)
    app.router.add_get('/_relay/stream/{id}', stream)
    app.router.add_route('*', '/{path:.*}', proxy)
    return app


if __name__ == '__main__':
    web.run_app(make_app(os.environ.get('RELAY_SECRET', ''), Path(__file__).parent / 'web'),
                host='0.0.0.0', port=int(os.environ.get('PORT', '10000')), access_log=None)
