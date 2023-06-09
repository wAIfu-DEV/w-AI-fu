import base64
import sys

from typing import List
from boilerplate import API

from novelai_api.BanList import BanList
from novelai_api.BiasGroup import BiasGroup
from novelai_api.GlobalSettings import GlobalSettings
from novelai_api.Preset import Model, Preset
from novelai_api.Tokenizer import Tokenizer
from novelai_api.utils import b64_to_tokens


import logging

from flask import Flask, request, jsonify

app = Flask(__name__)

log = logging.getLogger('werkzeug')
log.disabled = True
app.logger.disabled = True

bad_words: BanList = BanList(':', ' :', '::', ' ::', '*:', ';', ' ;', ';;', ' ;;', '#', ' #', '|', ' |', '{', ' {', '}', ' }', '[', ' [', ']', ' ]', '\\', ' \\', '/', ' /', '*', ' *', '~', ' ~', 'bye', ' bye', 'Bye', ' Bye', 'goodbye', ' goodbye', 'Goodbye', ' Goodbye', 'goodbye', ' goodnight', 'Goodnight', ' Goodnight', 'www', ' www', 'http', ' http', 'https', ' https', '.com', '.org', '.net')


@app.route('/loaded', methods=['GET'])
def loaded():
    return '', 200

@app.route('/api', methods=['POST'])
async def api():
    data = request.get_json()
    try:
        text = await generate(data['data'][0], data['data'][1], data['data'][2], data['data'][3], data['data'][4])
        return jsonify({'data': [str(base64.b64encode(bytes(text, encoding='utf8')), encoding='utf8')]}), 200
    except Exception as e:
        if e.args[0] == 401:
            print('Incorrect NovelAI credentials.', file=sys.stderr)
        else:
            print(e, file=sys.stderr)
        return 500

async def generate(custom_prompt, craziness, creativity, max_output_length, is_clio_model = False):
    global bad_words
    async with API() as api_handler:
        novel_api = api_handler.api

        model = Model.Euterpe
        if is_clio_model == True:
            model = Model.Clio
        
        #preset = Preset.from_default(model)
        #preset = Preset.from_official(model, "Moonlit Chronicler")
        #preset = Preset.from_official(model, "Top Gun Beta")
        preset = Preset.from_official(model, "Basic Coherence")
        if is_clio_model == True:
            preset = Preset.from_official(model, "Long Press")
        
        preset["max_length"] = max_output_length #120
        preset["min_length"] = 1 #1
        preset["repetition_penalty"] = craziness + 0.5 # + 1 #1.75 #1.15375 #1.1537
        #preset["repetition_penalty_frequency"] = 0 #0
        #preset["repetition_penalty_presence"] = 0 #0
        #preset["repetition_penalty_range"] = 2048 #2048
        #preset["repetition_penalty_slope"] = 0.2 #0.33
        #preset["tail_free_sampling"] = 0.87 #0.87
        preset["temperature"] = creativity + 1 #0.6 #0.585
        #preset["top_k"] = 0 #0
        #preset["top_p"] = 1 #1
        #preset["top_a"] = 0.85 #1
        #preset["typical_p"] = 1 #1
        preset["stop_sequences"] = [[198], [628], [25]] # FOR EUTERP
        if is_clio_model == True:
            preset["stop_sequences"] = [[85], [49287]] # FOR CLIO
        
        global_settings = GlobalSettings(num_logprobs=GlobalSettings.NO_LOGPROBS)
        global_settings["bias_dinkus_asterism"] = False
        global_settings["generate_until_sentence"] = True
        global_settings["ban_ambiguous_genji_tokens"] = True
        bias_groups: List[BiasGroup] = []
        module = 'vanilla'
        prompt = Tokenizer.encode(model, custom_prompt)
        gen = await novel_api.high_level.generate(prompt, model, preset, global_settings, bad_words, bias_groups, module)
        decoded = Tokenizer.decode(model, b64_to_tokens(gen["output"]))
        return decoded

if __name__ == '__main__':
    f = open('../bad_words/bad_words_b64', 'r')
    bw_b64 = f.read()
    f.close()

    bw = str(base64.b64decode(bw_b64), encoding='utf8')
    for s in bw.splitlines():
        bad_words += ' ' + s

    app.run(host='127.0.0.1', port=int(sys.argv[1]))