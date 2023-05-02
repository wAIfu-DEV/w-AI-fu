import base64

f = open('bad_words_b64', 'r')
content = f.read()
f.close()

dec = base64.b64decode(content)

f = open('bad_words.txt', 'w')
f.write(str(dec, encoding='utf8'))
f.close()