import pyaudio  

def list_devices():
    p = pyaudio.PyAudio()
    device_count = p.get_device_count()
    for i in range(0, device_count):
        info = p.get_device_info_by_index(i)
        print(f'[{info["index"]}] {info["name"]}')
    
    do_info = p.get_default_output_device_info()
    di_info = p.get_default_input_device_info()

    print('\nDefault audio devices:')
    print('Output')
    print(f'[{do_info["index"]}] {do_info["name"]}')
    print('Input')
    print(f'[{di_info["index"]}] {di_info["name"]}')

    device_index = ''
    while (device_index.isnumeric() == False or not (int(device_index) >= 0 and int(device_index) <= device_count)):
        device_index = input('\nChose voice output device index (can be changed later using !audio_out):')
    f = open('device.txt', 'w')
    f.write(device_index)
    f.close()


list_devices()