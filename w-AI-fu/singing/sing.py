import sys
import sounddevice as sd
import soundfile as sf
import threading
import time

def play_wav(filename, device):
    data, fs = sf.read(filename, dtype='float32')
    print(f"Playing: {filename} on device: {device}")
    sys.stdout.flush()
    sd.play(data, fs, device=device, blocking=True)
    sd.wait()
    print(f"Finished playing: {filename}")

if __name__ == '__main__':
    file1 = sys.argv[1]
    device1 = int(sys.argv[2])

    time.sleep(1)

    play_wav(file1, device1)
    sd.stop()