# CREDITS
#   Code provided by xxandeer https://github.com/xxandeer

import os
import requests
import pyaudio
import wave
import time
import json

from os import system
from os import path
from pydub import AudioSegment
from flask import Flask, request, jsonify

app = Flask(__name__)
audio = pyaudio.PyAudio()
device_index = 0

interrupt_next = False


pht_auth = ''
pht_user = ''


def play_ht_api_tts_request(text, voice):
    global pht_auth, pht_user
    url = "https://play.ht/api/v1/convert"
    payload = {
        "content": [text],
        "voice": voice
    }
    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "AUTHORIZATION": pht_auth,
        "X-USER-ID": pht_user
    }
    response = requests.post(url, json=payload, headers=headers)
    return response.json()


def get_tts_file(transcription_id):
    global pht_auth, pht_user
    url = f"https://play.ht/api/v1/articleStatus?transcriptionId={transcription_id}"
    headers = {
        "accept": "application/json",
        "AUTHORIZATION": pht_auth,
        "X-USER-ID": pht_user
    }
    response = requests.get(url, headers=headers)
    return response.json()

@app.route('/loaded', methods=['GET'])
async def loaded():
    return '', 200

@app.route('/interrupt', methods=['GET'])
async def interrupt():
    global interrupt_next
    interrupt_next = True
    return '', 200


@app.route('/api', methods=['POST'])
def api():
    try:
        data = request.get_json()
        generate_tts(speak=data['data'][0], voice_seed=data['data'][1])
        play_tts()
        return jsonify({'message': 'OK'}), 200
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'error': str(e)}), 500


def generate_tts(speak, voice_seed):
    response_data = play_ht_api_tts_request(speak, voice_seed)
    transcription_id = response_data.get('transcriptionId')

    tts_data = get_tts_file(transcription_id)
    converted = tts_data.get('converted')

    while not converted:
        tts_data = get_tts_file(transcription_id)
        converted = tts_data.get('converted')

    tts_url = tts_data.get('audioUrl')
    if tts_url:
        response = requests.get(tts_url)
        with open('tts.mp3', 'wb') as f:
            f.write(response.content)


def play_tts():
    global audio, interrupt_next
    interrupt_next = False
    # Convert .mp3 to .wav
    path = os.path.abspath('../ffmpeg/ffmpeg.exe')
    os.system(f'"{path}" -loglevel quiet -y -i tts.mp3 tts.wav')
    # Open the wave file
    wave_file = wave.open('tts.wav', 'rb')
    # Open a stream for capturing audio from the virtual audio cable
    virtual_cable_stream = audio.open(format=audio.get_format_from_width(wave_file.getsampwidth()),
                                      channels=1,
                                      rate=wave_file.getframerate(),
                                      output=True,
                                      output_device_index=device_index)
    # Read data from the wave file and capture it from the virtual audio cable
    data = wave_file.readframes(8192)
    while data:
        if interrupt_next:
            interrupt_next = False
            break
        virtual_cable_stream.write(data)
        data = wave_file.readframes(8192)
    # Clean up resources
    virtual_cable_stream.stop_stream()
    virtual_cable_stream.close()
    wave_file.close()


if __name__ == '__main__':
    f = open('../../config.json', 'r')
    obj = json.loads(f.read())
    f.close()
    device_index = int(obj["audio_device"])
    f = open('../../UserData/auth/play-ht_auth.txt', 'r')
    pht_auth = f.read()
    f.close()
    f = open('../../UserData/auth/play-ht_user.txt', 'r')
    pht_user = f.read()
    f.close()
    print(pht_user)
    print(pht_auth)
    app.run(host='127.0.0.1', port=7850)
