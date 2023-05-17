import os
import pyaudio  
import wave
import json

from os import path
from os import system
from pydub import AudioSegment
from boilerplate import API
from flask import Flask, request, jsonify, make_response

app = Flask(__name__)
audio = pyaudio.PyAudio()
device_index = 0

interrupt_next = False

@app.route('/loaded', methods=['GET'])
async def loaded():
    return '', 200

@app.route('/interrupt', methods=['GET'])
async def interrupt():
    global interrupt_next
    interrupt_next = True
    return '', 200

@app.route('/api', methods=['POST', 'OPTIONS'])
async def api():
    if request.method == "OPTIONS": # CORS preflight
        return _build_cors_preflight_response()

    data = request.get_json()
    await generate_tts(speak=data['data'][0], voice_seed=data['data'][1])
    play_tts()
    response = jsonify({'message': 'OK'})
    response.headers.add("Access-Control-Allow-Origin", "*")
    return response, 200

def _build_cors_preflight_response():
    response = make_response()
    response.headers.add("Access-Control-Allow-Origin", "*")
    response.headers.add('Access-Control-Allow-Headers', "*")
    response.headers.add('Access-Control-Allow-Methods', "*")
    return response

async def generate_tts(speak, voice_seed):
    async with API() as api_handler:
        api = api_handler.api
        text = speak
        voice = voice_seed # "Aini"
        seed = -1 #42
        opus = False
        version = 'v2'
        tts = await api.low_level.generate_voice(text, voice, seed, opus, version)
        with open('tts.mp3', 'wb') as f:
            f.write(tts)

def list_devices():
    p = pyaudio.PyAudio()
    device_count = p.get_device_count()
    for i in range(0, device_count):
        info = p.get_device_info_by_index(i)
        print("Device {} = {}".format(info["index"], info["name"]))

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
                                      channels=1, #wave_file.getnchannels(),
                                      rate=wave_file.getframerate(),
                                      output=True,
                                      output_device_index=device_index) # Set the input device index to the virtual audio cable
    # Read data from the wave file and capture it from the virtual audio cable
    data = wave_file.readframes(8192) #1024
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
    app.run(host='127.0.0.1', port=7850)


