"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const cproc = __importStar(require("child_process"));
const fetch = require('node-fetch');
const readline = require('readline/promises');
const { resolve } = require('path');
const rl = readline.createInterface(process.stdin, process.stdout);
var InputMode;
(function (InputMode) {
    InputMode[InputMode["Text"] = 0] = "Text";
    InputMode[InputMode["Voice"] = 1] = "Voice";
})(InputMode || (InputMode = {}));
class Config {
    character_name = '';
    user_name = '';
    is_voice_input = false;
    parrot_mode = false;
    read_live_chat = false;
    twitch_channel_name = '';
    chat_read_timeout_sec = 2;
    filter_bad_words = true;
}
class Character {
    char_name = '';
    voice = '';
    char_persona = '';
    example_dialogue = '';
}
class Memory {
    long_term = '';
    short_term = [];
}
class wAIfuApp {
    started = false;
    is_debug = false;
    live_chat = false;
    chat_reader_initialized = false;
    input_skipped = false;
    bad_words = [];
    command_queue = [];
    last_chat_msg = '';
    input_mode = InputMode.Text;
    config = new Config();
    character = new Character();
    memory = new Memory();
}
const wAIfu = new wAIfuApp();
class SubProc {
    process = null;
    api_url = '';
    running = false;
}
const LLM = {
    process: null,
    api_url: 'http://127.0.0.1:7840',
    running: false
};
const TTS = {
    process: null,
    api_url: 'http://127.0.0.1:7850',
    running: false
};
const CHAT = {
    process: null,
    api_url: 'http://127.0.0.1:7830',
    running: false
};
const STT = {
    process: null,
    api_url: '',
    running: false
};
main();
async function main() {
    init();
    main_loop: while (true) {
        const { input, sender, pseudo } = await getInput(wAIfu.input_mode);
        const handled = (sender === 'CHAT')
            ? input
            : await handleCommand(input);
        if (handled === null || handled === '') {
            wAIfu.input_skipped = true;
            continue main_loop;
        }
        let prompt = `${sender}: ${handled}\n${wAIfu.character.char_name}:`;
        let response = await sendToLLM(flattenMemory() + prompt);
        let displayed = (sender === 'CHAT')
            ? `${pseudo} said: ${handled}.${response}`
            : response;
        if (verifyText(displayed)) {
            displayed = ' Filtered.\n';
            response = ' Filtered.\n';
        }
        put(`${wAIfu.character.char_name}:${displayed}`);
        wAIfu.memory.short_term.push(`${sender}: ${input}\n${wAIfu.character.char_name}:${response}`);
        await sendToTTS(displayed);
    }
}
function init() {
    process.title = 'w-AI-fu';
    put('Starting w-AI-fu ...\n');
    put('Loading config informations ...\n');
    wAIfu.config = getConfig();
    wAIfu.live_chat = wAIfu.config.read_live_chat;
    wAIfu.input_mode = (wAIfu.config.is_voice_input)
        ? InputMode.Voice
        : InputMode.Text;
    put(`Loading character "${wAIfu.config.character_name}" ...\n`);
    wAIfu.character = getCharacter();
    wAIfu.memory.long_term = `(${wAIfu.character.char_persona})\n\n${wAIfu.character.example_dialogue}`;
    if (wAIfu.config.filter_bad_words) {
        put('Loading filter ...\n');
        wAIfu.bad_words = getBadWords();
    }
    if (!isAuthCorrect()) {
        put('Failed auth validation, exiting.\n');
        closeProgram(0);
    }
    if (fs.existsSync('./devices/device.txt') === false) {
        put('Could not find default audio device, asking user ...\n');
        cproc.spawnSync('start', ['cmd /c "python audio_devices.py"'], { cwd: './devices', shell: true });
    }
    put('Spawning subprocesses ...\n');
    summonProcesses(wAIfu.input_mode);
    put('Loaded w-AI-fu.\n\n');
    put('Commands: !mode [text, voice], !say [...], !script [_.txt], !chat [on, off], !history, !char, !reset, !stop, !save, !debug, !reload\n');
    init_get();
}
function flattenMemory() {
    let result = wAIfu.memory.long_term;
    while (wAIfu.memory.short_term.length > 10) {
        wAIfu.memory.short_term.shift();
    }
    for (let m of wAIfu.memory.short_term) {
        result += m;
    }
    return result;
}
function isAuthCorrect() {
    const USR = fs.readFileSync('../auth/novel_user.txt').toString().trim();
    const PSW = fs.readFileSync('../auth/novel_pass.txt').toString().trim();
    const OAU = fs.readFileSync('../auth/twitch_oauth.txt').toString().trim();
    if (USR === '') {
        put('Validation Error: NovelAI account mail adress is missing from auth/novel_user.txt\n');
        return false;
    }
    if (PSW === '') {
        put('Validation Error: NovelAI account password is missing from auth/novel_pass.txt\n');
        return false;
    }
    if (OAU === '' && wAIfu.config.read_live_chat === true) {
        put('Validation Error: twitch oauth token is missing from auth/twitch_oauth.txt\n');
        return false;
    }
    return true;
}
async function getInput(mode) {
    if (wAIfu.input_skipped === false) {
        put('> ');
    }
    wAIfu.input_skipped = false;
    let result = undefined;
    let sender = wAIfu.config.user_name;
    let pseudo = '';
    switch (mode) {
        case InputMode.Text:
            result = await textGet();
            break;
        case InputMode.Voice:
            result = await voiceGet();
            break;
    }
    wAIfu.started = true;
    if (wAIfu.chat_reader_initialized === false && (wAIfu.live_chat === true)) {
        fetch(CHAT.api_url + '/run', {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ data: [wAIfu.config.twitch_channel_name] })
        });
        wAIfu.chat_reader_initialized = true;
    }
    if (result === null && wAIfu.live_chat) {
        const { message, name } = await getChatOrNothing();
        result = message;
        pseudo = name;
        sender = 'CHAT';
    }
    if (result === undefined || result === null) {
        put('Critical error: input is invalid.');
        closeProgram(1);
        process.exit(1);
    }
    return { input: result, sender, pseudo };
}
async function getChatOrNothing() {
    if (wAIfu.live_chat === false) {
        return { message: '', name: '' };
    }
    let chatmsg = await getLastTwitchChat();
    chatmsg.message = sanitizeText(chatmsg.message);
    let filtered = verifyText(chatmsg.message);
    if (wAIfu.last_chat_msg === chatmsg.message || filtered === true) {
        return { message: '', name: '' };
    }
    else {
        wAIfu.last_chat_msg = chatmsg.message;
        return { message: chatmsg.message, name: chatmsg.user };
    }
}
function getConfig() {
    const buff = fs.readFileSync('../config.json');
    return JSON.parse(buff.toString());
}
function getBadWords() {
    const fcontent = fs.readFileSync('./bad_words/bad_words_b64').toString();
    const buff = Buffer.from(fcontent, 'base64');
    const tostr = buff.toString('utf-8');
    return tostr.split(/\r\n|\n/g).map((v) => { return v.toLowerCase(); });
}
function getCharacter() {
    const buff = fs.readFileSync(`./characters/${wAIfu.config.character_name}.json`);
    return JSON.parse(buff.toString());
}
function summonProcesses(mode) {
    if (!LLM.running)
        startLLM();
    if (!TTS.running)
        startTTS();
    switch (mode) {
        case InputMode.Text:
            if (STT.running) {
                STT.process?.kill();
                STT.running = false;
            }
            break;
        case InputMode.Voice:
            if (!STT.running)
                startSTT();
            break;
    }
    if (wAIfu.live_chat) {
        if (!CHAT.running)
            startLiveChat();
    }
}
function startLLM() {
    if (LLM.running)
        return;
    const USR = fs.readFileSync('../auth/novel_user.txt').toString().trim();
    const PSW = fs.readFileSync('../auth/novel_pass.txt').toString().trim();
    LLM.process = cproc.spawn('python', ['novel_llm.py'], { cwd: './novel', env: { NAI_USERNAME: USR, NAI_PASSWORD: PSW } });
    LLM.running = true;
}
function startTTS() {
    if (TTS.running)
        return;
    const USR = fs.readFileSync('../auth/novel_user.txt').toString().trim();
    const PSW = fs.readFileSync('../auth/novel_pass.txt').toString().trim();
    TTS.process = cproc.spawn('python', ['novel_tts.py'], { cwd: './novel', env: { NAI_USERNAME: USR, NAI_PASSWORD: PSW } });
    TTS.running = true;
}
function startLiveChat() {
    if (CHAT.running)
        return;
    CHAT.process = cproc.spawn('python', ['twitchchat.py'], { cwd: './twitch' });
    CHAT.running = true;
}
function startSTT() {
    if (STT.running)
        return;
    STT.process = cproc.spawn('python', ['speech.py'], { cwd: './speech' });
    STT.running = true;
}
async function sendToLLM(prompt) {
    const input = prompt;
    const module = '';
    const payload = JSON.stringify({ data: [input, module] });
    debug('sending: ' + payload + '\n');
    const post_query = await fetch(LLM.api_url + '/api', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload
    });
    const data = await post_query.json();
    const raw = Buffer.from(data.data[0], 'base64');
    debug('received: ' + JSON.stringify({ "data": raw.toString('utf-8') }) + '\n');
    let response = raw.toString('utf-8').replace(/\n.*/, '');
    if (response.slice(-1) !== '\n')
        response = response + '\n';
    return response;
}
async function handleCommand(command) {
    if (wAIfu.config.parrot_mode && command.startsWith('!', 0) === false) {
        command = '!say ' + command;
        if (wAIfu.input_mode === InputMode.Voice)
            put('\n');
    }
    if (command.length > 0 && command[0] !== '!')
        return command;
    if (command === '')
        return command;
    const com_spl = command.split(' ');
    const com = com_spl[0];
    switch (com) {
        case '!say':
            await sendToTTS(command.substring('!say '.length, undefined));
            return null;
        case '!reset':
            wAIfu.memory.short_term = [];
            return null;
        case '!history':
            put('\x1B[1;30m' + flattenMemory() + '\n' + '\x1B[0m');
            return null;
        case '!debug':
            wAIfu.is_debug = true;
            return null;
        case '!stop':
            closeProgram(0);
            return null;
        case '!char':
            put(`\x1B[1;30m(${wAIfu.character.char_persona})\n\n${wAIfu.character.example_dialogue}\x1B[0m\n`);
            return null;
        case '!save':
            const f = './saved/log_' + new Date().getTime().toString()
                + '.txt';
            put('\x1B[1;30m' + 'saved to: ' + resolve(f) + '\n' + '\x1B[0m');
            fs.writeFileSync(f, flattenMemory());
            return null;
        case '!script':
            const fpath = command.substring('!script '.length, undefined).trim();
            const fpath_resolved = `./scripts/${fpath}`;
            if (!fs.existsSync(fpath_resolved)) {
                put(`Cannot open file: ${fpath_resolved}\n`);
                return null;
            }
            let fcontent = fs.readFileSync(fpath_resolved).toString();
            const lines = fcontent.split('-');
            for (let line of lines)
                await sendToTTS(line);
            return null;
        case '!reload':
            put('Reloading files ...\n');
            wAIfu.config = getConfig();
            wAIfu.character = getCharacter();
            wAIfu.bad_words = getBadWords();
            closeSubProcesses();
            summonProcesses(wAIfu.input_mode);
            return null;
        case '!mode':
            const mode = command.substring('!mode '.length, undefined).trim();
            switch (mode.toLowerCase()) {
                case 'text':
                    wAIfu.input_mode = InputMode.Text;
                    summonProcesses(InputMode.Text);
                    break;
                case 'voice':
                    wAIfu.input_mode = InputMode.Voice;
                    summonProcesses(InputMode.Voice);
                    break;
                default:
                    put('Invalid input mode, must be either text or voice\n');
                    break;
            }
            return null;
        case '!chat':
            const chat_toggle = command.substring('!chat '.length, undefined).trim();
            switch (chat_toggle.toLowerCase()) {
                case 'on':
                    wAIfu.live_chat = true;
                    startLiveChat();
                    break;
                case 'off':
                    wAIfu.live_chat = false;
                    startLiveChat();
                    break;
                default:
                    put('Invalid chat mode, must be either on or off\n');
                    break;
            }
            return null;
        default:
            put('Invalid command.\n');
            return null;
    }
}
function sanitizeText(text) {
    return text.replace(/[^a-zA-Z .,?!]/g, '');
}
function verifyText(text) {
    const low_text = text.toLowerCase();
    for (const bw of wAIfu.bad_words) {
        if (low_text.includes(bw)) {
            put('FILTER MATCHED: "' + bw + '" in "' + text + '"\n');
            return true;
        }
    }
    return false;
}
async function sendToTTS(say) {
    let voice = (wAIfu.character.voice == '')
        ? 'galette'
        : wAIfu.character.voice;
    const payload = JSON.stringify({ data: [say, voice] });
    debug('sending: ' + payload + '\n');
    const post_query = await fetch(TTS.api_url + '/api', {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: payload
    });
    const data = await post_query.json();
    debug('received: ' + JSON.stringify(data) + '\n');
}
async function getLastTwitchChat() {
    const get_query = await fetch(CHAT.api_url + '/api');
    const data = await get_query.json();
    debug('received: ' + JSON.stringify(data) + '\n');
    return data;
}
function init_get() {
    const e = (input) => {
        wAIfu.command_queue.push(input);
        debug('Added: ' + input + ' to queue.\n');
    };
    rl.on('line', e);
}
function textGet() {
    debug('Awaiting text input ...\n');
    return new Promise((resolve) => {
        let text = null;
        let resolved = false;
        if (wAIfu.live_chat && wAIfu.started) {
            setTimeout(() => {
                if (resolved)
                    return;
                debug('Input timeout.\n');
                resolved = true;
                resolve(text);
            }, wAIfu.config.chat_read_timeout_sec * 1000);
        }
        const checkQueue = () => {
            if (resolved)
                return;
            if (wAIfu.command_queue.length > 0) {
                debug(`Consuming queue element: ${wAIfu.command_queue[0]}\n`);
                text = wAIfu.command_queue.shift();
                resolved = true;
                resolve(text);
            }
            else {
                setTimeout(checkQueue, 250);
            }
        };
        checkQueue();
    });
}
function voiceGet() {
    return new Promise((resolve) => {
        let text = null;
        let resolved = false;
        if (wAIfu.live_chat && wAIfu.started) {
            setTimeout(() => {
                if (resolved)
                    return;
                resolved = true;
                resolve(text);
            }, wAIfu.config.chat_read_timeout_sec * 1000);
        }
        const checkFile = () => {
            if (resolved)
                return;
            if (fs.existsSync('./speech/input.txt')) {
                text = fs.readFileSync('./speech/input.txt').toString();
                fs.unlinkSync('./speech/input.txt');
                resolved = true;
                resolve(text);
            }
            else if (wAIfu.command_queue.length > 0) {
                debug(`Consuming queue element: ${wAIfu.command_queue[0]}\n`);
                text = wAIfu.command_queue.shift();
                resolved = true;
                resolve(text);
            }
            else {
                setTimeout(checkFile, 250);
            }
        };
        checkFile();
    });
}
function closeSubProcesses() {
    put('Killing subprocesses ...\n');
    if (CHAT.process !== null && CHAT.running) {
        CHAT.process.kill();
        CHAT.running = false;
    }
    if (LLM.process !== null && LLM.running) {
        LLM.process.kill();
        LLM.running = false;
    }
    if (TTS.process !== null && TTS.running) {
        TTS.process.kill();
        TTS.running = false;
    }
    if (STT.process !== null && STT.running) {
        STT.process.kill();
        STT.running = false;
    }
}
function closeProgram(code) {
    closeSubProcesses();
    put('Exiting w.AI.fu\n');
    process.exit(code);
}
function put(text) {
    process.stdout.write(text);
}
function debug(text) {
    if (wAIfu.is_debug)
        process.stdout.write('\x1B[1;30m' + text + '\x1B[0m');
}
