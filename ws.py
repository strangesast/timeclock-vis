# connect to mongo
# tail cursor on 'state' collection
# accept websocket connections at /socket
# update clients as required
# log?
from aiohttp import web
from util import get_mongo_db
from pymongo.cursor import CursorType


async def websocket_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    db = request.app['db'].timeclock;
    cursor = db.state.find(cursor_type=CursorType.TAILABLE, await_data=True)
    while True:
        if not cursor.alive:
            now = datetime.datetime.utcnow()
            # While collection is empty, tailable cursor dies immediately
            await asyncio.sleep(1)
            cursor = collection.find(cursor_type=CursorType.TAILABLE, await_data=True)

        async for value in cursor:
            print(value)

    # async for msg in ws:
    #     if msg.type == aiohttp.WSMsgType.TEXT:
    #         if msg.data == 'close':
    #             await ws.close()
    #         else:
    #             await ws.send_str(msg.data + '/answer')
    #     elif msg.type == aiohttp.WSMsgType.ERROR:
    #         print('ws connection closed with exception %s' %
    #               ws.exception())

    # print('websocket connection closed')

    return ws


async def main():
    config = configparser.ConfigParser()
    config.read('config.ini')
    app = web.Application()
    app.add_routes(routes)
    app['db'] = await get_mongo_db(config['MONGO'])
    app.add_routes([web.get('/ws', websocket_handler)])
    return app


if __name__ == '__main__':
    web.run_app(main())
