import pyaudio
import json

def send_devices():
    p = pyaudio.PyAudio()
    device_count = p.get_device_count()
    obj = {}
    for i in range(0, device_count):
        info = p.get_device_info_by_index(i)
        obj[info["name"].strip()] = info["index"]
    obj["default"] = ""
    f = open('devices.json', 'w')
    json.dump(obj, f)
    f.close()

send_devices()
