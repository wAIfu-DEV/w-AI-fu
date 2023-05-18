import speech_recognition as sr
import os.path
from os import system
import time

print('Loading speech recognition ...')

if os.path.isfile('input.txt'):
    os.remove('input.txt')

while True:
    while os.path.isfile('input.txt'):
        time.sleep(0.25)

    with sr.Microphone() as source:
        recognizer = sr.Recognizer()
        recognizer.energy_threshold = 1500
        source.pause_threshold = 0.25
        print('Awaiting audio input ...')
        audio = recognizer.listen(source, phrase_time_limit=None, timeout=None)
        try:
            text = recognizer.recognize_google(audio)
            #text = recognizer.recognize_api(audio)
            if text:
                print(f"Recognized: {text}")
                with open('input.txt', 'w') as f:
                    f.write(text)
        except:
            continue