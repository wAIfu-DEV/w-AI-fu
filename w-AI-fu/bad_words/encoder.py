import base64

f = open('bad_words.txt', 'r')
content = f.read()
f.close()

enc = base64.b64encode(bytes(content, encoding='utf8'))

f = open('bad_words_b64', 'w')
f.write(str(enc, encoding='utf8'))
f.close()