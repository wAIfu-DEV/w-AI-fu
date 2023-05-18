import pyaudio
import requests

def send_devices():
    p = pyaudio.PyAudio()
    device_count = p.get_device_count()
    obj = {}
    for i in range(0, device_count):
        info = p.get_device_info_by_index(i)
        obj[info["name"].strip()] = info["index"]
        #print(f'[{info["index"]}] {info["name"]}')
    req = requests.post('http://127.0.0.1:7860/setdevices', json=obj)
    print(req.text)

send_devices()
