import base64

from typing import List, Optional
from boilerplate import API

from novelai_api.BanList import BanList
from novelai_api.BiasGroup import BiasGroup
from novelai_api.GlobalSettings import GlobalSettings
from novelai_api.Preset import Model, Preset
from novelai_api.Tokenizer import Tokenizer
from novelai_api.utils import b64_to_tokens


from flask import Flask, request, jsonify

app = Flask(__name__)

bad_words_list = []


@app.route('/api', methods=['POST'])
async def api():
    data = request.get_json()
    text = await generate(data['data'][0], data['data'][1])
    return jsonify({'data': [str(base64.b64encode(bytes(text, encoding='utf8')), encoding='utf8')]}), 200

async def generate(custom_prompt, custom_module):
    async with API() as api_handler:
        novel_api = api_handler.api
        model = Model.Euterpe
        #model = Model.Krake
        preset = Preset.from_official(model, "Basic Coherence")
        #preset = Preset.from_official(model, "Moonlit Chronicler")
        #preset = Preset.from_official(model, "Top Gun Beta")
        #preset = Preset.from_default(model)
        preset["max_length"] = 60 #40
        preset["min_length"] = 1 #1
        preset["repetition_penalty"] = 1.75 #1.15375 #1.1537
        #preset["repetition_penalty_frequency"] = 0 #0
        #preset["repetition_penalty_presence"] = 0 #0
        #preset["repetition_penalty_range"] = 2048 #2048
        #preset["repetition_penalty_slope"] = 0.2 #0.33
        #preset["tail_free_sampling"] = 0.87 #0.87
        preset["temperature"] = 0.6 #0.585
        #preset["top_k"] = 0 #0
        #preset["top_p"] = 1 #1
        #preset["top_a"] = 0.85 #1
        #preset["typical_p"] = 1 #1
        preset["stop_sequences"] = [[198]]
        global_settings = GlobalSettings(num_logprobs=GlobalSettings.NO_LOGPROBS)
        global_settings["bias_dinkus_asterism"] = False
        global_settings["generate_until_sentence"] = False
        global_settings["ban_ambiguous_genji_tokens"] = False
        bad_words = BanList(':', ' :', '::', ' ::', ';', ' ;', ';;', ' ;;', '#', ' #', '|', ' |', '{', ' {', '}', ' }', '[', ' [', ']', ' ]', '\\', ' \\', '/', ' /', '*', ' *', '~', ' ~', 'bye', ' bye', 'Bye', ' Bye', 'goodbye', ' goodbye', 'Goodbye', ' Goodbye', 'goodbye', ' goodnight', 'Goodnight', ' Goodnight', 'www', ' www', 'http', ' http', 'https', ' https', '.com', '.org', '.net')
        
        for s in bad_words_list:
            bad_words += ' ' + s

        bias_groups: List[BiasGroup] = []
        module = 'vanilla'
        if not custom_module == '':
            module = custom_module
        prompt = Tokenizer.encode(model, custom_prompt)
        gen = await novel_api.high_level.generate(prompt, model, preset, global_settings, bad_words, bias_groups, module)
        decoded = Tokenizer.decode(model, b64_to_tokens(gen["output"]))
        return decoded

if __name__ == '__main__':
    f = open('../bad_words/bad_words_b64', 'r')
    bw_b64 = f.read()
    f.close()

    bw = str(base64.b64decode(bw_b64), encoding='utf8')
    bad_words_list = bw.splitlines()

    app.run(host='127.0.0.1', port=7840)


