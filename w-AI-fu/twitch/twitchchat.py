import websocket
import re
import os
import sys

import logging

from flask import Flask, jsonify, request

app = Flask(__name__)
started = False
last_usr = ''
last_msg = ''
channel = ''

log = logging.getLogger('werkzeug')
log.disabled = True
app.logger.disabled = True

def errlog(text: str):
    print(str, file=sys.stderr)

@app.route('/loaded', methods=['GET'])
async def loaded():
    return '', 200

@app.route('/api', methods=['GET'])
async def api():
    return jsonify({'user': last_usr, 'message': last_msg}), 200

@app.route('/run', methods=['POST'])
async def run():
    global channel
    data = request.get_json()
    channel = re.sub('[^a-zA-Z0-9\_\-]', '', data['data'][0])
    print('Starting WebSocket ...', file=sys.stdout)
    await launch_ws()


async def launch_ws():
    ws = websocket.WebSocketApp('wss://irc-ws.chat.twitch.tv:443',
                                on_open=on_open,
                                on_message=on_message,
                                on_error=on_error,
                                on_close=on_close
                                )
    ws.run_forever()


def parse_message(message):
    global last_usr
    global last_msg
    global channel
    split_msg = message.split('\r\n')[-2]
    last_usr = re.findall('(?<=^:)(.*?)(?=!)', split_msg)[0]
    last_msg = re.findall(f'(?<=PRIVMSG #{channel} :)(.*)', split_msg)[0]


def on_message(ws, message):
    global started
    print(message)
    if 'PING' in message:
        ws.send('PONG')
        return
    if ':End of /NAMES list' in message:
        started = True
        return
    if started:
        parse_message(message)


async def on_error(ws, error):
    errlog("ERROR: " + error)
    print("RETRYING ...")
    await launch_ws()


def on_close(ws, close_status_code, close_msg):
    print('Closed WebSocket.')


def on_open(ws):
    global channel
    oauth = os.environ['OAUTH']
    ws.send(f'PASS oauth:{oauth}')
    ws.send(f'NICK {channel}')
    ws.send(f'JOIN #{channel}')


if __name__ == '__main__':
    websocket.enableTrace(False)
    app.run(host='127.0.0.1', port=7830)
