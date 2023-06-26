import pyaudio
import json

def send_devices():
    p = pyaudio.PyAudio()
    device_count = p.get_device_count()
    obj = {}
    for i in range(0, device_count):
        info = p.get_device_info_by_index(i)
        if info["maxOutputChannels"] > 0 and info["hostApi"] == 0:
            obj[info["name"].strip()] = info["index"]
            #print(info["name"], info["index"], str(info["maxOutputChannels"]), str(info["maxInputChannels"]), info["hostApi"])
    
    obj["default"] = ""
    f = open('devices.json', 'w')
    json.dump(obj, f)
    f.close()

send_devices()
