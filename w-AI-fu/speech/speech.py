import speech_recognition as sr
import os.path
import time
import sys

print('Loading speech recognition ...', file=sys.stdout)

if os.path.isfile('input.txt'):
    os.remove('input.txt')

while True:
    while os.path.isfile('input.txt'):
        time.sleep(0.15)

    with sr.Microphone() as source:
        recognizer = sr.Recognizer()
        recognizer.energy_threshold = 2500 #50 - 4000
        recognizer.adjust_for_ambient_noise(source, 0.5)
        source.pause_threshold = 0.25
        print('Awaiting audio input ...', file=sys.stdout)
        audio = None
        try:
            audio = recognizer.listen(source, phrase_time_limit=10, timeout=None)
        except:
            continue
        try:
            text = recognizer.recognize_google(audio)
            #text = recognizer.recognize_api(audio)
            if text:
                print(f"Recognized: {text}", file=sys.stdout)
                with open('input.txt', 'w') as f:
                    f.write(text)
        except:
            continue