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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const DEBUGMODE = false;
const fs = __importStar(require("fs"));
const cproc = __importStar(require("child_process"));
const ws_1 = require("ws");
const extract_zip_1 = __importDefault(require("extract-zip"));
const readline = __importStar(require("readline/promises"));
const path = __importStar(require("path"));
const readline_interface = readline.createInterface(process.stdin, process.stdout);
const HOST_PATH = '127.0.0.1';
const PORT_WSS = 7870;
const PORT_LLM = 7840;
const PORT_TTS = 7850;
const PORT_CHAT = 7830;
var ErrorCode;
(function (ErrorCode) {
    ErrorCode[ErrorCode["None"] = 0] = "None";
    ErrorCode[ErrorCode["UnHandeld"] = 1] = "UnHandeld";
    ErrorCode[ErrorCode["InvalidValue"] = 2] = "InvalidValue";
    ErrorCode[ErrorCode["HTTPError"] = 3] = "HTTPError";
    ErrorCode[ErrorCode["Critical"] = 4] = "Critical";
})(ErrorCode || (ErrorCode = {}));
const wss = new ws_1.WebSocketServer({ host: HOST_PATH, port: PORT_WSS });
let ws = null;
wss.on('connection', (socket) => {
    debug('connected ws server.\n');
    ws = socket;
    ws.on('error', console.error);
    ws.on('message', (data) => handleSocketMessage(data));
});
async function handleSocketMessage(data) {
    const message = String(data);
    let type = message.split(' ')[0];
    if (type === undefined)
        type = message;
    const payload = (type.length !== message.length)
        ? message.substring(type.length + 1, undefined)
        : '';
    debug(`ws received: ${message}\n`);
    switch (type) {
        case 'MSG':
            wsMSG(payload);
            return;
        case 'AUTH_GET':
            wsAUTH_GET();
            return;
        case 'AUTH_SET':
            wsAUTH_SET(payload);
            return;
        case 'LATEST':
            wsLATEST();
            return;
        case 'CONFIG':
            wsCONFIG(payload);
            return;
        case 'CHARA':
            wsCHARA(payload);
            return;
        case 'DEVICE':
            wsDEVICE(payload);
            return;
        case 'INTERRUPT':
            wsINTERRUPT();
            return;
        default:
            return;
    }
    ;
}
function wsMSG(data) {
    put(`${data}\n`);
    wAIfu.command_queue.push(data);
}
function wsINTERRUPT() {
    fetch(TTS.api_url + '/interrupt')
        .then(() => {
        fs.writeFileSync('./captions/transcript.txt', '');
    });
}
function wsLATEST() {
    ws.send('LATEST ' + JSON.stringify({
        "config": wAIfu.config,
        "character": wAIfu.character,
        "chars_list": retreiveCharacters(),
        "version": wAIfu.package.version,
        "audio_devices": wAIfu.audio_devices
    }));
}
function wsCONFIG(data) {
    const obj = JSON.parse(data);
    if (wAIfu.config.character_name !== obj.character_name) {
        wAIfu.config.character_name = obj.character_name;
        wAIfu.character = getCharacter();
    }
    wAIfu.config = obj;
    fs.writeFileSync('../config.json', data);
    wAIfu.should_reload = true;
}
function wsAUTH_GET() {
    ws.send('AUTH ' + JSON.stringify({
        "novel-mail": getAuth('novel_user'),
        "novel-pass": getAuth('novel_pass'),
        "twitch-oauth": getAuth('twitch_oauth'),
        "playht-auth": getAuth('play-ht_auth'),
        "playht-user": getAuth('play-ht_user')
    }));
}
function wsAUTH_SET(data) {
    const obj = JSON.parse(data);
    setAuth('novel_user', obj["novel-mail"]);
    setAuth('novel_pass', obj["novel-pass"]);
    setAuth('twitch_oauth', obj["twitch-oauth"]);
    setAuth('play-ht_auth', obj["playht-auth"]);
    setAuth('play-ht_user', obj["playht-user"]);
    wAIfu.should_reload = true;
}
function wsCHARA(data) {
    const obj = JSON.parse(data);
    wAIfu.config.character_name = obj.char_name;
    wAIfu.character = obj;
    fs.writeFileSync(`../UserData/characters/${obj.char_name}.json`, data);
}
function wsDEVICE(data) {
    const obj = JSON.parse(data);
    wAIfu.audio_devices = obj;
}
var InputMode;
(function (InputMode) {
    InputMode[InputMode["Text"] = 0] = "Text";
    InputMode[InputMode["Voice"] = 1] = "Voice";
})(InputMode || (InputMode = {}));
class Package {
    version = '';
}
class Config {
    character_name = '';
    user_name = '';
    is_voice_input = false;
    parrot_mode = false;
    read_live_chat = false;
    monologue = false;
    tts_use_playht = false;
    twitch_channel_name = '';
    chat_read_timeout_sec = 2;
    filter_bad_words = true;
    audio_device = -1;
    mic_sensitivity = 0.5;
    use_clio_model = false;
}
class Character {
    char_name = '';
    voice = '';
    char_persona = '';
    example_dialogue = '';
    topics = [];
    craziness = 0.5;
    creativity = 0.5;
    max_output_length = 120;
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
    dialog_transcript = '';
    input_mode = InputMode.Text;
    config = new Config();
    package = new Package();
    character = new Character();
    memory = new Memory();
    audio_devices = {};
    init_cycle = 0;
    should_reload = false;
}
const wAIfu = new wAIfuApp();
class SubProc {
    process = null;
    api_url = '';
    running = false;
    constructor(port) {
        this.api_url = port;
    }
}
const LLM = new SubProc(`http://${HOST_PATH}:${PORT_LLM}`);
const TTS = new SubProc(`http://${HOST_PATH}:${PORT_TTS}`);
const CHAT = new SubProc('');
const STT = new SubProc('');
main();
async function main() {
    if (process.argv.find(value => value === '--test') !== undefined) {
        await test();
        closeProgram(0);
        return;
    }
    await init();
    main_loop: while (true) {
        const inputObj = await getInput(wAIfu.input_mode);
        if (inputObj === null)
            continue main_loop;
        if (wAIfu.should_reload === true) {
            await handleCommand('!reload');
            wAIfu.should_reload = false;
        }
        const { input, sender, pseudo } = inputObj;
        const is_chat = sender === 'CHAT';
        const handled = (is_chat)
            ? input
            : await handleCommand(input);
        if (handled === null || handled === '') {
            wAIfu.input_skipped = true;
            continue main_loop;
        }
        if (ws !== null && ws.readyState === ws.OPEN) {
            if (is_chat)
                ws.send('MSG_CHAT ' + JSON.stringify({ "user": pseudo, "text": handled }));
            else
                ws.send('MSG_IN ' + handled);
        }
        const identifier = (is_chat)
            ? `[CHAT] ${pseudo}`
            : sender;
        let additional_memories = (is_chat)
            ? ''
            : getChatMemories(pseudo);
        let prompt = `${identifier}: ${handled}\n${wAIfu.character.char_name}:`;
        let response = await sendToLLM(flattenMemory(additional_memories) + prompt);
        let displayed = (is_chat)
            ? ` ${pseudo} said "${handled}".${response}`
            : response;
        let filtered_content = null;
        const verify_result = verifyText(displayed);
        if (verify_result.result === true) {
            filtered_content = verify_result.matched;
            response = ' Filtered.\n';
        }
        put(`${wAIfu.character.char_name}:${displayed}`);
        if (ws !== null && ws.readyState === ws.OPEN) {
            ws.send('MSG_OUT ' + JSON.stringify({
                "text": displayed,
                "filtered": filtered_content
            }));
        }
        if (filtered_content === null) {
            const new_memory = `${identifier}: ${input}\n${wAIfu.character.char_name}:${response}`;
            wAIfu.memory.short_term.push(new_memory);
            wAIfu.dialog_transcript += new_memory;
            if (is_chat)
                addChatMemory(pseudo, new_memory);
        }
        else {
            displayed = ' Filtered.';
        }
        await sendToTTS(displayed);
        continue;
    }
}
async function init() {
    process.title = 'w-AI-fu Console';
    wAIfu.package = getPackage();
    put(`w-AI-fu ${wAIfu.package.version}\n`);
    if (await shouldUpdate() === true) {
        await update();
    }
    if (fs.existsSync('./ffmpeg/ffmpeg.exe') === false) {
        errPut('Could not find ffmpeg. ffmpeg is not included in the w-AI-fu repository by default because of its size (> 100MB). If you cloned the repository, download the latest release instead:\nhttps://github.com/wAIfu-DEV/w-AI-fu/releases\n');
        closeProgram(ErrorCode.Critical);
    }
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
    put('Getting audio devices ...\n');
    getDevices();
    put('Spawning subprocesses ...\n');
    await summonProcesses(wAIfu.input_mode);
    put('Starting WebUI ...\n');
    cproc.spawn('cmd.exe', ['/C', 'start index.html'], { cwd: './ui' });
    put('Loaded w-AI-fu.\n\n');
    put('Commands: !mode [text, voice], !say [...], !script [_.txt], !chat [on, off], !history, !char, !reset, !stop, !save, !debug, !reload\n');
    init_get();
}
async function reinit() {
    wAIfu.init_cycle++;
    put('Reinitializing ...\n');
    wAIfu.package = getPackage();
    wAIfu.config = getConfig();
    wAIfu.chat_reader_initialized = false;
    wAIfu.live_chat = wAIfu.config.read_live_chat;
    wAIfu.input_mode = (wAIfu.config.is_voice_input)
        ? InputMode.Voice
        : InputMode.Text;
    wAIfu.character = getCharacter();
    wAIfu.memory.long_term = `(${wAIfu.character.char_persona})\n\n${wAIfu.character.example_dialogue}`;
    if (wAIfu.config.filter_bad_words) {
        wAIfu.bad_words = getBadWords();
    }
    put('Getting audio devices ...\n');
    getDevices();
    await summonProcesses(wAIfu.input_mode);
}
function flattenMemory(additional) {
    while (wAIfu.memory.short_term.length > 4) {
        wAIfu.memory.short_term.shift();
    }
    return wAIfu.memory.long_term
        + additional
        + wAIfu.memory.short_term.join('');
}
function isAuthCorrect() {
    const USR = getAuth('novel_user');
    const PSW = getAuth('novel_pass');
    const OAU = getAuth('twitch_oauth');
    const PTA = getAuth('play-ht_auth');
    const PTU = getAuth('play-ht_user');
    if (USR === '') {
        put('Validation Error: NovelAI account mail adress is missing from UserData/auth/novel_user.txt\n');
        return false;
    }
    if (PSW === '') {
        put('Validation Error: NovelAI account password is missing from UserData/auth/novel_pass.txt\n');
        return false;
    }
    if (OAU === '' && wAIfu.config.read_live_chat === true) {
        put('Validation Error: twitch oauth token is missing from UserData/auth/twitch_oauth.txt\n');
        return false;
    }
    if (PTA === '' && wAIfu.config.tts_use_playht === true) {
        put('Validation Error: play.ht auth token is missing from UserData/auth/play-ht_auth.txt\n');
        return false;
    }
    if (PTU === '' && wAIfu.config.tts_use_playht === true) {
        put('Validation Error: play.ht user token is missing from UserData/auth/play-ht_user.txt\n');
        return false;
    }
    return true;
}
async function getInput(mode) {
    const old_init_cycle = wAIfu.init_cycle;
    if (wAIfu.input_skipped === false) {
        put('> ');
    }
    wAIfu.input_skipped = false;
    let result = null;
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
    if (old_init_cycle !== wAIfu.init_cycle) {
        debug('discarded input because of init cycle change.\n');
        return null;
    }
    if (!isAuthCorrect()) {
        put('Failed auth validation, could not continue.\n');
        return null;
    }
    wAIfu.started = true;
    if (result === null && wAIfu.live_chat) {
        const { message, name } = await getChatOrNothing();
        is_mono: if (wAIfu.config.monologue === true && message === '' && name === '') {
            if (wAIfu.character.topics.length <= 0)
                break is_mono;
            let rdm = Math.random();
            let topic = wAIfu.character.topics[Math.round((wAIfu.character.topics.length - 1) * rdm)];
            if (topic === undefined) {
                errPut('Critical Error: topic was undefined\n');
                closeProgram(1);
            }
            return { input: `!mono ${topic}`, sender: 'USER', pseudo: '' };
        }
        result = message;
        pseudo = name;
        sender = 'CHAT';
    }
    if (result === null) {
        errPut('Critical error: input is invalid.\n');
        closeProgram(1);
        process.exit(1);
    }
    return { input: result, sender, pseudo };
}
async function getChatOrNothing() {
    if (wAIfu.live_chat === false) {
        debug('Returned empty msg because wAIfu.live_chat is false.\n');
        return { message: '', name: '' };
    }
    let chatmsg = await getLastTwitchChat();
    chatmsg.message = sanitizeText(chatmsg.message);
    if (wAIfu.last_chat_msg === chatmsg.message) {
        debug(`Skipped message because is same than previous one: ${wAIfu.last_chat_msg}\n`);
        return { message: '', name: '' };
    }
    else {
        debug('Successfuly got new message.\n');
        wAIfu.last_chat_msg = chatmsg.message;
        return { message: chatmsg.message, name: chatmsg.name };
    }
}
function getConfig() {
    const buff = fs.readFileSync('../config.json');
    return JSON.parse(buff.toString());
}
function getPackage() {
    const buff = fs.readFileSync('./package.json');
    return JSON.parse(buff.toString());
}
function getBadWords() {
    if (wAIfu.config.filter_bad_words === false)
        return [];
    let fcontent = fs.readFileSync('./bad_words/bad_words_b64').toString();
    const buff = Buffer.from(fcontent, 'base64');
    const tostr = buff.toString('utf-8');
    return tostr.split(/\r\n|\n/g).map((v) => { return v.toLowerCase(); });
}
function getCharacter() {
    const buff = fs.readFileSync(`../UserData/characters/${wAIfu.config.character_name}.json`);
    return JSON.parse(buff.toString());
}
async function summonProcesses(mode) {
    if (!LLM.running)
        await startLLM();
    if (!TTS.running)
        await startTTS();
    switch (mode) {
        case InputMode.Text:
            break;
        case InputMode.Voice:
            if (!STT.running)
                await startSTT();
            break;
    }
    if (wAIfu.live_chat) {
        if (!CHAT.running)
            await startLiveChat();
    }
    await awaitProcessLoaded(LLM, 'LLM');
    put('Loaded LLM.\n');
    await awaitProcessLoaded(TTS, 'TTS');
    put('Loaded TTS.\n');
    if (mode === InputMode.Voice) {
        put('Loaded STT.\n');
    }
    if (wAIfu.live_chat) {
        await awaitProcessLoaded(CHAT, 'CHAT');
        put('Loaded CHAT.\n');
    }
}
function readPythonStdOut(subprocess, proc_name) {
    subprocess.process?.stdout?.on('data', data => {
        if (data.toString().startsWith(' *'))
            return;
        put(`python ${proc_name}:\n`);
        put(data.toString() + '\n');
    });
}
function readPythonStdErr(subprocess, proc_name) {
    subprocess.process?.stderr?.on('data', data => {
        if (data.toString().startsWith(' *'))
            return;
        put(`python ${proc_name}:\n`);
        errPut(data.toString() + '\n');
    });
}
async function startLLM() {
    if (LLM.running)
        return;
    const USR = getAuth('novel_user');
    const PSW = getAuth('novel_pass');
    LLM.process = cproc.spawn('python', ['novel_llm.py'], { cwd: './novel', env: { NAI_USERNAME: USR, NAI_PASSWORD: PSW }, detached: DEBUGMODE, shell: DEBUGMODE });
    readPythonStdOut(LLM, 'LLM');
    readPythonStdErr(LLM, 'LLM');
    LLM.running = true;
}
async function startTTS() {
    if (TTS.running)
        return;
    const USR = (wAIfu.config.tts_use_playht) ? getAuth('play-ht_user') : getAuth('novel_user');
    const PSW = (wAIfu.config.tts_use_playht) ? getAuth('play-ht_auth') : getAuth('novel_pass');
    const tts_provider = (wAIfu.config.tts_use_playht) ? 'playht_tts.py' : 'novel_tts.py';
    TTS.process = cproc.spawn('python', [tts_provider], { cwd: './novel', env: { NAI_USERNAME: USR, NAI_PASSWORD: PSW }, detached: DEBUGMODE, shell: DEBUGMODE });
    readPythonStdOut(TTS, 'TTS');
    readPythonStdErr(TTS, 'TTS');
    TTS.running = true;
}
async function startLiveChat() {
    if (CHAT.running)
        return;
    const OAUTH = getAuth('twitch_oauth');
    if (fs.existsSync('./twitch/loaded.txt') === true) {
        fs.unlinkSync('./twitch/loaded.txt');
    }
    if (fs.existsSync('./twitch/msg.txt') === true) {
        fs.unlinkSync('./twitch/msg.txt');
    }
    CHAT.process = cproc.spawn('python', ['twitchchat.py'], { cwd: './twitch', env: { OAUTH: OAUTH, CHANNEL: wAIfu.config.twitch_channel_name }, detached: DEBUGMODE, shell: DEBUGMODE });
    readPythonStdOut(CHAT, 'CHAT');
    readPythonStdErr(CHAT, 'CHAT');
    CHAT.running = true;
}
async function startSTT() {
    if (STT.running)
        return;
    STT.process = cproc.spawn('python', ['speech.py'], { cwd: './speech', detached: DEBUGMODE, shell: DEBUGMODE });
    readPythonStdOut(STT, 'STT');
    readPythonStdErr(STT, 'STT');
    STT.running = true;
}
async function sendToLLM(prompt) {
    const payload = JSON.stringify({ data: [
            prompt,
            (wAIfu.character.craziness !== undefined) ? wAIfu.character.craziness : 0.5,
            (wAIfu.character.creativity !== undefined) ? wAIfu.character.creativity : 0.5,
            (wAIfu.character.max_output_length !== undefined) ? wAIfu.character.max_output_length : 120,
            (wAIfu.config.use_clio_model !== undefined) ? wAIfu.config.use_clio_model : false
        ] });
    debug('sending: ' + payload + '\n');
    const post_query = await fetch(LLM.api_url + '/api', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload
    }).catch((e) => {
        errPut('Critical Error: Could not contact the LLM subprocess.\n');
        console.log(e);
        closeProgram(ErrorCode.HTTPError);
    });
    const text = await post_query.text();
    if (text[0] !== undefined && text[0] !== '{') {
        errPut('Critical Error: Received incorrect json from LLM.\n');
        console.log(text);
        closeProgram(ErrorCode.InvalidValue);
    }
    const data = JSON.parse(text);
    const raw = Buffer.from(data.data[0], 'base64');
    debug('received: ' + JSON.stringify({ "data": raw.toString('utf-8') }) + '\n');
    let response = raw.toString('utf-8').replace(/\n.*/, '');
    if (response.slice(-1) !== '\n')
        response = response + '\n';
    return response;
}
async function handleCommand(command) {
    if (wAIfu.config.parrot_mode && command.startsWith('!', 0) === false) {
        if (wAIfu.input_mode === InputMode.Voice)
            put(command + '\n');
        ws.send(`MSG_IN ${command}`);
        ws.send(`MSG_OUT ${JSON.stringify({ "text": command, "filtered": null })}`);
        command = '!say ' + command;
    }
    if (command.length > 0 && command[0] !== '!')
        return command;
    if (command === '')
        return command;
    const com_spl = command.split(' ');
    const com = com_spl[0];
    switch (com) {
        case '!say': {
            await sendToTTS(command.substring('!say '.length, undefined));
            return null;
        }
        case '!testvoice': {
            let voice = command.substring('!testvoice '.length, undefined).split('###')[0];
            await sendToTTS(command.substring('!testvoice '.length + voice.length + '###'.length, undefined), voice);
            return null;
        }
        case '!reset': {
            wAIfu.memory.short_term = [];
            return null;
        }
        case '!history': {
            put('\x1B[1;30m' + wAIfu.dialog_transcript + '\n' + '\x1B[0m');
            return null;
        }
        case '!memory': {
            put('\x1B[1;30m' + flattenMemory('') + '\n' + '\x1B[0m');
            return null;
        }
        case '!debug': {
            wAIfu.is_debug = true;
            return null;
        }
        case '!stop': {
            closeProgram(0);
            return null;
        }
        case '!char': {
            put(`\x1B[1;30m(${wAIfu.character.char_persona})\n\n${wAIfu.character.example_dialogue}\x1B[0m\n`);
            return null;
        }
        case '!save': {
            const f = '../UserData/saved/log_' + new Date().getTime().toString() + '.txt';
            put('\x1B[1;30m' + 'saved to: ' + path.resolve(f) + '\n' + '\x1B[0m');
            fs.writeFileSync(f, wAIfu.dialog_transcript);
            return null;
        }
        case '!script': {
            const fpath = command.substring('!script '.length, undefined).trim();
            const fpath_resolved = `../UserData/scripts/${fpath}`;
            if (!fs.existsSync(fpath_resolved)) {
                warnPut(`Error: Cannot open file ${fpath_resolved}\n`);
                return null;
            }
            let fcontent = fs.readFileSync(fpath_resolved).toString();
            const lines = fcontent.split('-');
            for (let line of lines)
                await sendToTTS(line);
            return null;
        }
        case '!reload': {
            await closeSubProcesses();
            await reinit();
            return null;
        }
        case '!mode': {
            const mode = command.substring('!mode '.length, undefined).trim();
            switch (mode.toLowerCase()) {
                case 'text':
                    wAIfu.input_mode = InputMode.Text;
                    await summonProcesses(InputMode.Text);
                    break;
                case 'voice':
                    wAIfu.input_mode = InputMode.Voice;
                    await summonProcesses(InputMode.Voice);
                    break;
                default:
                    put('Invalid input mode, must be either text or voice\n');
                    break;
            }
            return null;
        }
        case '!chat': {
            const chat_toggle = command.substring('!chat '.length, undefined).trim();
            switch (chat_toggle.toLowerCase()) {
                case 'on':
                    wAIfu.live_chat = true;
                    await startLiveChat();
                    break;
                case 'off':
                    wAIfu.live_chat = false;
                    break;
                default:
                    put('Invalid chat mode, must be either on or off\n');
                    break;
            }
            return null;
        }
        case '!config': {
            console.log(wAIfu.config);
            return null;
        }
        case '!state': {
            console.log(wAIfu);
            return null;
        }
        case '!mono': {
            const topic = command.substring('!mono '.length, undefined).trim();
            put(`[ ${wAIfu.character.char_name} starts talking about ${topic}. ]\n`);
            await monologue(topic);
            return null;
        }
        default:
            put('Invalid command.\n');
            return null;
    }
}
function sanitizeText(text) {
    return text.replaceAll(/[^a-zA-Z .,?!0-9\+\-\%\*\/]/g, '');
}
function verifyText(text) {
    const low_text = text.toLowerCase();
    for (const bw of wAIfu.bad_words) {
        if (low_text.includes(bw)) {
            put('FILTER MATCHED: "' + bw + '" in "' + text + '"\n');
            return { result: true, matched: bw };
        }
    }
    return { result: false, matched: '' };
}
function sendToTTS(say, test_voice = '') {
    return new Promise(async (resolve) => {
        exposeCaptions(say);
        let promise_resolved = false;
        let default_voice = (wAIfu.config.tts_use_playht === true)
            ? 'Scarlett'
            : 'galette';
        let voice = (wAIfu.character.voice == '')
            ? default_voice
            : wAIfu.character.voice;
        if (test_voice !== '')
            voice = test_voice;
        const payload = JSON.stringify({ data: [say, voice] });
        debug('sending: ' + payload + '\n');
        setTimeout(() => {
            if (promise_resolved === true)
                return;
            promise_resolved = true;
            warnPut('Error: Timed out while awaiting for TTS\'s response.\n');
            exposeCaptions('');
            resolve();
        }, 45000);
        const post_query = await fetch(TTS.api_url + '/api', {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: payload
        }).catch((e) => {
            errPut('Critical Error: Could not contact the TTS subprocess.\n');
            console.log(e);
            closeProgram(ErrorCode.HTTPError);
        });
        if (promise_resolved === true)
            return;
        const text = await post_query.text();
        if (text[0] !== undefined && text[0] !== '{') {
            errPut('Critical Error: Received incorrect json from TTS.\n');
            console.log(text);
            closeProgram(ErrorCode.InvalidValue);
        }
        const data = JSON.parse(text);
        debug('received: ' + JSON.stringify(data) + '\n');
        if (data["message"] === 'AUDIO_ERROR') {
            warnPut('Error: Could not play TTS because of invalid output audio device.\n');
        }
        if (data["message"] === 'GENERATION_ERROR') {
            warnPut('Error: Could not play TTS because of an error with the NovelAI API.\n');
        }
        promise_resolved = true;
        exposeCaptions('');
        resolve();
    });
}
async function getLastTwitchChat() {
    let data = { message: '', name: '' };
    if (fs.existsSync('./twitch/msg.txt') == true) {
        const raw = fs.readFileSync('./twitch/msg.txt', { encoding: 'utf8' });
        data['name'] = raw.split(';')[0];
        data['message'] = raw.substring(data['name'].length, undefined);
    }
    return data;
}
function init_get() {
    const e = (input) => {
        wAIfu.command_queue.push(input);
        debug('Added: ' + input + ' to queue.\n');
    };
    readline_interface.on('line', e);
}
function textGet() {
    debug('Awaiting text input ...\n');
    return new Promise((resolve) => {
        const old_init_cycle = wAIfu.init_cycle;
        let text = null;
        let resolved = false;
        if (wAIfu.live_chat) {
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
            if (wAIfu.init_cycle !== old_init_cycle) {
                resolved = true;
                resolve(null);
            }
            else if (wAIfu.command_queue.length > 0) {
                debug(`Consuming queue element: ${wAIfu.command_queue[0]}\n`);
                text = wAIfu.command_queue.shift();
                if (text === undefined)
                    text = null;
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
        const old_init_cycle = wAIfu.init_cycle;
        let text = null;
        let resolved = false;
        if (wAIfu.live_chat) {
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
            if (wAIfu.init_cycle !== old_init_cycle) {
                resolved = true;
                resolve(null);
            }
            else if (fs.existsSync('./speech/input.txt')) {
                text = fs.readFileSync('./speech/input.txt').toString('utf8');
                resolved = true;
                fs.unlinkSync('./speech/input.txt');
                resolve(text);
            }
            else if (wAIfu.command_queue.length > 0) {
                debug(`Consuming queue element: ${wAIfu.command_queue[0]}\n`);
                text = wAIfu.command_queue.shift();
                if (text === undefined)
                    text = null;
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
async function monologue(topic) {
    const prompt = `[${wAIfu.character.char_name} starts talking about ${topic}]\n${wAIfu.character.char_name}:`;
    let displayed = '';
    let filtered_txt = null;
    const response = await sendToLLM(flattenMemory('') + prompt);
    displayed = response;
    let verify_result = verifyText(response);
    if (verify_result.result === true) {
        filtered_txt = verify_result.matched;
    }
    put(`${wAIfu.character.char_name}:${displayed}`);
    exposeCaptions(displayed);
    if (ws !== null && ws.readyState === ws.OPEN) {
        ws.send('MSG_OUT ' + JSON.stringify({ "text": displayed, "filtered": filtered_txt }));
    }
    if (filtered_txt === null) {
        const new_memory = `${prompt}${displayed}`;
        wAIfu.memory.short_term.push(new_memory);
        wAIfu.dialog_transcript += new_memory;
    }
    else {
        displayed = ' Filtered.';
    }
    await sendToTTS(displayed);
    exposeCaptions('');
}
async function closeSubProcesses() {
    put('Killing subprocesses ...\n');
    await killProc(CHAT, 'CHAT');
    await killProc(LLM, 'LLM');
    await killProc(TTS, 'TTS');
    await killProc(STT, 'STT');
}
function killProc(proc, proc_name) {
    return new Promise((resolve) => {
        if (proc.process !== null && proc.running) {
            proc.process.on('close', () => {
                put(`Closed ${proc_name}.\n`);
                proc.process = null;
                resolve();
            });
            let success = proc.process.kill(2);
            if (!success)
                warnPut(`Error: Could not kill process ${proc_name}.\n`);
            else
                proc.running = false;
        }
        else {
            resolve();
        }
    });
}
function closeProgram(code = ErrorCode.None) {
    closeSubProcesses();
    put('Exiting w.AI.fu\n');
    process.exit(code);
}
function put(text) {
    process.stdout.write(text);
}
function warnPut(text) {
    process.stdout.write('\x1B[0;33m' + text + '\x1B[0m');
}
function errPut(text) {
    process.stdout.write('\x1B[0;31m' + text + '\x1B[0m');
    if (ws !== null && ws.readyState === ws.OPEN) {
        ws.send('ERROR ' + text);
    }
}
function debug(text) {
    if (wAIfu.is_debug || DEBUGMODE)
        process.stdout.write('\x1B[1;30m' + text + '\x1B[0m');
}
function exposeCaptions(text) {
    fs.writeFileSync('./captions/transcript.txt', text);
}
function getChatMemories(user) {
    const db = fetchChatDatabase();
    const logs = db.get(user);
    let result = '';
    if (logs === undefined)
        return result;
    for (let s of logs) {
        result += Buffer.from(s, 'base64').toString('utf8');
    }
    return result;
}
function addChatMemory(user, memory) {
    const db = fetchChatDatabase();
    const logs = db.get(user);
    const b64_mem = Buffer.from(memory, 'utf8').toString('base64');
    if (logs === undefined) {
        db.set(user, [b64_mem]);
        return;
    }
    ;
    while (logs.length > 3)
        logs.shift();
    logs.push(b64_mem);
    updateChatDatabase(db);
}
function fetchChatDatabase() {
    let fcontent = fs.readFileSync('../UserData/data/chat_user_db.csv', { encoding: 'utf8' });
    return parseChatDatabase(fcontent);
}
function updateChatDatabase(obj) {
    let s = flattenChatDatabase(obj);
    fs.writeFileSync('../UserData/data/chat_user_db.csv', s);
}
function parseChatDatabase(csv) {
    const lines = csv.split(/\r\n|\n/);
    let csv_map = new Map();
    for (let i = 0; i < lines.length; ++i) {
        if (lines[i].trim() === '')
            break;
        let spl = lines[i].split(',');
        if (spl.length !== 5) {
            errPut(`Critical Error: Incorrect formating of chat_user_db.csv file at line ${i}. Expected line length of 5, got ${spl.length}\n`);
            closeProgram(1);
        }
        csv_map.set(spl[0], [spl[1], spl[2], spl[3], spl[4]]);
    }
    return csv_map;
}
function flattenChatDatabase(obj) {
    let flat = '';
    for (let [key, value] of obj) {
        while (value.length > 4)
            value.shift();
        let line = key;
        for (let s of value) {
            line += ',' + s;
        }
        flat += line + '\n';
    }
    return flat;
}
function retreiveCharacters() {
    const files = fs.readdirSync('../UserData/characters');
    let result = [];
    for (let f of files) {
        if (f.endsWith('.json'))
            result.push(f);
    }
    return result;
}
function modifyConfig(field, value) {
    if (value === null || value === undefined) {
        throw new Error('Tried assigning invalid value to config field: ' + field);
    }
    if (wAIfu.config[field] === undefined) {
        throw new Error('Tried assigning value to inecistant config field: ' + field);
    }
    wAIfu.config[field] = value;
    fs.writeFileSync('../config.json', JSON.stringify(wAIfu.config));
}
function awaitProcessLoaded(proc, proc_name) {
    return new Promise((resolve) => {
        let loaded = false;
        let is_chat_proc = (proc_name === 'CHAT');
        const timeout = () => {
            if (loaded)
                return;
            else {
                errPut(`Critical Error: Could not contact ${proc_name} python script after 10s\n`);
                closeProgram(ErrorCode.Critical);
                return;
            }
        };
        const checkloaded = async () => {
            if (loaded)
                return;
            try {
                if (is_chat_proc === false) {
                    const r = await fetch(proc.api_url + '/loaded');
                    loaded = true;
                    resolve();
                    return;
                }
                else {
                    if (fs.existsSync('./twitch/loaded.txt') === true) {
                        loaded = true;
                        fs.unlinkSync('./twitch/loaded.txt');
                        resolve();
                        return;
                    }
                    else {
                        setTimeout(checkloaded, 500);
                    }
                }
            }
            catch (e) {
                setTimeout(checkloaded, 500);
            }
        };
        setTimeout(checkloaded, 500);
        setTimeout(timeout, 10 * 1000);
    });
}
function getDevices() {
    if (fs.existsSync('./devices/devices.json')) {
        fs.unlinkSync('./devices/devices.json');
    }
    cproc.spawnSync('python', ['audio_devices.py'], { cwd: './devices' });
    const data = fs.readFileSync('./devices/devices.json');
    wAIfu.audio_devices = JSON.parse(data.toString('utf8'));
}
function getAuth(what) {
    return basic_decode(fs.readFileSync(`../UserData/auth/${what}.txt`));
}
function setAuth(what, data) {
    fs.writeFileSync(`../UserData/auth/${what}.txt`, basic_encode(data));
}
function basic_encode(data) {
    let b64 = Buffer.from(data, 'utf8').toString('base64');
    let hex = Buffer.from(b64, 'base64').toString('hex');
    return hex;
}
function basic_decode(data) {
    let b64 = Buffer.from(data.toString(), 'hex').toString('base64');
    return Buffer.from(b64, 'base64').toString('utf8');
}
async function unzip(zip_file_path, to_directory) {
    try {
        await (0, extract_zip_1.default)(path.resolve(zip_file_path), { dir: path.resolve(to_directory) });
        return true;
    }
    catch (e) {
        warnPut(`Error: Could not unzip file ${zip_file_path} to directory ${to_directory}\n`);
        console.log(e);
        return false;
    }
}
function printProgress(percent = 0) {
    let buff = ''.padStart(Math.round(percent * 35), '#').padEnd(35, ' ');
    put('\r                                       ');
    put('\r[' + buff + '] ' + Math.round(percent * 100).toString() + '%');
}
async function shouldUpdate() {
    if (fs.existsSync('../.dev') === true) {
        return false;
    }
    let query;
    try {
        query = await fetch('https://api.github.com/repos/wAIfu-DEV/w-AI-fu/tags');
    }
    catch (e) {
        warnPut('Error: Could not contact github while trying to get latest version.\n');
        return false;
    }
    const data = await query.json().catch((e) => {
        warnPut('Error: Could not retreive latest version from github.\n');
        return false;
    });
    if (data[0] === undefined || data[0]["name"] === undefined) {
        warnPut('Error: Fetched invalid data from github while trying to retreive latest version.\n');
        return false;
    }
    if (wAIfu.package.version !== data[0].name) {
        const new_version = String(data[0].name).replaceAll(/[^0-9\.\,\-]/g, '');
        const answer = await readline_interface.question(`\nA new version of w-AI-fu is available (${new_version})\nDo you want to install it? (Y/n): `);
        return /Y|y/g.test(answer);
    }
    return false;
}
async function update() {
    put('\n');
    let query;
    try {
        query = await fetch('https://github.com/wAIfu-DEV/w-AI-fu/releases/latest/download/w-AI-fu.zip');
    }
    catch (e) {
        warnPut('Error: Could not contact github while trying to download w-AI-fu.\n');
        return false;
    }
    printProgress(0.1);
    let arbuff;
    try {
        arbuff = await query.arrayBuffer();
    }
    catch (e) {
        warnPut('Error: Could not read received data from github while trying to download w-AI-fu.\n');
        return false;
    }
    printProgress(0.2);
    const buff = Buffer.from(arbuff);
    printProgress(0.3);
    fs.writeFileSync('../temp.zip', buff);
    wAIfu.config = getConfig();
    printProgress(0.4);
    if (fs.existsSync('../TEMP') === false)
        fs.mkdirSync('../TEMP');
    fs.cpSync('../UserData', '../TEMP', { recursive: true, force: true });
    process.chdir('../');
    printProgress(0.5);
    try {
        fs.readdirSync('./').forEach((path) => {
            if (path !== 'TEMP' && path !== 'temp.zip') {
                if (path === 'w-AI-fu') {
                    fs.readdirSync('./w-AI-fu').forEach((path2) => {
                        if (path2 !== 'run.bat')
                            fs.rmSync('./w-AI-fu/' + path2, { force: true, recursive: true });
                    });
                }
                else {
                    fs.rmSync('./' + path, { force: true, recursive: true });
                }
            }
        });
    }
    catch (e) {
        errPut('Critical Error: Could not remove some files while updating, total reinstallation might be required. User data such as characters and scripts will be present in the TEMP directory.\n');
        closeProgram(ErrorCode.Critical);
        return false;
    }
    printProgress(0.7);
    await unzip('./temp.zip', './');
    if (fs.existsSync('./w-AI-fu main') === false) {
        errPut('Critical Error: Failed to extract the downloaded files, total reinstallation is required. User data such as characters and scripts will be present in the TEMP directory.\n');
        closeProgram(ErrorCode.Critical);
        return false;
    }
    printProgress(0.8);
    fs.cpSync('./w-AI-fu main', './', { recursive: true, force: false });
    fs.rmSync('./w-AI-fu main', { force: true, recursive: true });
    printProgress(0.9);
    fs.cpSync('./TEMP', './UserData', { recursive: true, force: true });
    fs.rmSync('./TEMP', { force: true, recursive: true });
    fs.rmSync('./temp.zip', { force: true, recursive: true });
    fs.writeFileSync('./config.json', JSON.stringify(wAIfu.config));
    printProgress(1);
    put('\nSuccessfully updated w-AI-fu.\n\n');
    cproc.spawnSync(require.resolve(path.resolve('./INSTALL.bat')));
    closeProgram(ErrorCode.None);
    return true;
}
async function test() {
    put('Entering TEST mode ...\n');
    put('Checking LLM response ...\n');
    await startLLM();
    await awaitProcessLoaded(LLM, 'LLM');
    let r = await sendToLLM('test');
    if (r === null || r === undefined) {
        errPut('rejected.');
        return;
    }
    await killProc(LLM, 'LLM');
    put('\x1B[0;32m' + 'passed.\n' + '\x1B[0m');
    put('Checking TTS response ...\n');
    await startTTS();
    await awaitProcessLoaded(TTS, 'TTS');
    await sendToTTS('test');
    await killProc(TTS, 'TTS');
    put('\x1B[0;32m' + 'passed.\n' + '\x1B[0m');
    put('Checking CHAT response ...\n');
    await startLiveChat();
    await awaitProcessLoaded(CHAT, 'CHAT');
    let c = await getLastTwitchChat();
    if (c === null || c === undefined) {
        errPut('rejected.\n');
        return;
    }
    await killProc(CHAT, 'CHAT');
    put('\x1B[0;32m' + 'passed.\n' + '\x1B[0m');
    put('Checking Text Input ...\n');
    init_get();
    wAIfu.config.read_live_chat = false;
    wAIfu.command_queue.push('test');
    let t = await textGet();
    if (t === null || t === undefined) {
        errPut('rejected.\n');
        return;
    }
    put('\x1B[0;32m' + 'passed.\n' + '\x1B[0m');
    put('Checking Voice Input ...\n');
    fs.writeFileSync('./speech/input.txt', 'test');
    let v = await voiceGet();
    if (t === null || t === undefined) {
        errPut('rejected.\n');
        return;
    }
    put('\x1B[0;32m' + 'passed.\n' + '\x1B[0m');
}
