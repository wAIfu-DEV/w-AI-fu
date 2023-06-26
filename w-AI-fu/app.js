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
const ws_1 = __importStar(require("ws"));
const extract_zip_1 = __importDefault(require("extract-zip"));
const readline = __importStar(require("readline/promises"));
const path = __importStar(require("path"));
const http = __importStar(require("http"));
const url = __importStar(require("url"));
const ReadlineInterface = readline.createInterface(process.stdin, process.stdout);
const HOST_PATH = '127.0.0.1';
let PORT_OFFSET = 0;
let PORT_WSS = 7770;
let PORT_LLM = 7760;
let PORT_TTS = 7750;
const PORT_TWITCH_AUTH_CALLBACK = 3000;
var ErrorCode;
(function (ErrorCode) {
    ErrorCode[ErrorCode["None"] = 0] = "None";
    ErrorCode[ErrorCode["UnHandeld"] = 1] = "UnHandeld";
    ErrorCode[ErrorCode["InvalidValue"] = 2] = "InvalidValue";
    ErrorCode[ErrorCode["HTTPError"] = 3] = "HTTPError";
    ErrorCode[ErrorCode["Critical"] = 4] = "Critical";
})(ErrorCode || (ErrorCode = {}));
let UiWebSocketServer = null;
try {
    UiWebSocketServer = new ws_1.WebSocketServer({ host: HOST_PATH, port: PORT_WSS + PORT_OFFSET });
}
catch (e) {
    errPut('Critical Error: Cannot run more than 1 instance of w-AI-fu. This might change in the future.');
    closeProgram(ErrorCode.Critical);
    process.exit(ErrorCode.Critical);
}
let UiWebSocket = null;
UiWebSocketServer.on('connection', (socket) => {
    debug('connected ws server.\n');
    UiWebSocket = socket;
    UiWebSocket.on('error', console.error);
    UiWebSocket.on('message', (data) => handleSocketMessage(data));
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
        case 'PAUSE':
            wsPAUSE();
            return;
        default:
            warnPut('Error: Could not handle socket message.\n');
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
function wsPAUSE() {
    wAIfu.is_paused = !wAIfu.is_paused;
    if (wAIfu.is_paused === true)
        wsINTERRUPT();
}
function wsLATEST() {
    UiWebSocket.send('LATEST ' + JSON.stringify({
        "config": wAIfu.config,
        "character": wAIfu.character,
        "chars_list": retreiveCharacters(),
        "version": wAIfu.package.version,
        "audio_devices": wAIfu.audio_devices
    }));
}
function wsCONFIG(data) {
    const obj = JSON.parse(data);
    if (obj === undefined || obj === null || typeof obj !== "object") {
        warnPut('Error: Got invalid config object from WebUI.\n');
        return;
    }
    if ("character_name" in obj === false) {
        warnPut('Error: Missing field "character_name" from the config object sent by WebUI.\n');
        return;
    }
    if ("character_name" in obj
        && typeof obj.character_name === "string"
        && wAIfu.config.character_name !== obj.character_name) {
        wAIfu.config.character_name = obj.character_name;
        wAIfu.character = getCharacter();
    }
    if (isOfClass(obj, wAIfu.config)) {
        wAIfu.config = obj;
    }
    else {
        warnPut('Error: config object received from WebUI is missing fields.\n');
        return;
    }
    fs.writeFileSync('../config.json', data);
    wAIfu.should_reload = true;
}
function wsAUTH_GET() {
    UiWebSocket.send('AUTH ' + JSON.stringify({
        "novel-mail": getAuth('novel_user'),
        "novel-pass": getAuth('novel_pass'),
        "twitch-oauth": getAuth('twitch_oauth'),
        "twitchapp-clientid": getAuth('twitchapp_clientid'),
        "twitchapp-secret": getAuth('twitchapp_secret')
    }));
}
function wsAUTH_SET(data) {
    const obj = JSON.parse(data);
    setAuth('novel_user', obj["novel-mail"]);
    setAuth('novel_pass', obj["novel-pass"]);
    setAuth('twitch_oauth', obj["twitch-oauth"]);
    setAuth('twitchapp_clientid', obj["twitchapp-clientid"]);
    setAuth('twitchapp_secret', obj["twitchapp-secret"]);
    wAIfu.should_reload = true;
}
function wsCHARA(data) {
    const obj = JSON.parse(data);
    wAIfu.config.character_name = obj.char_name;
    wAIfu.character = obj;
    fs.writeFileSync(`../UserData/characters/${obj.char_name}.json`, data);
    fs.writeFileSync('../config.json', JSON.stringify(wAIfu.config));
    wAIfu.should_reload = true;
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
    twitch_channel_name = '';
    chat_read_timeout_sec = 2;
    filter_bad_words = true;
    use_clio_model = false;
    audio_device = -1;
    audio_device_other = -1;
    monologue_chance = 50;
    tts_volume_modifier = 10;
    chatter_blacklist = [];
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
    is_debug = false;
    live_chat = false;
    chat_reader_initialized = false;
    input_skipped = false;
    bad_words = [];
    command_queue = [];
    last_chat_msg = '';
    new_chat_msg = '';
    new_chat_usr = '';
    dialog_transcript = '';
    input_mode = InputMode.Text;
    config = new Config();
    package = new Package();
    character = new Character();
    memory = new Memory();
    audio_devices = {};
    init_cycle = 0;
    should_reload = false;
    is_paused = false;
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
const LLM = new SubProc(`http://${HOST_PATH}:${PORT_LLM + PORT_OFFSET}`);
const TTS = new SubProc(`http://${HOST_PATH}:${PORT_TTS + PORT_OFFSET}`);
const CHAT = new SubProc('');
const STT = new SubProc('');
let TwitchChatWebSocket = null;
let TwitchEventSubWebSocket = null;
main();
async function main() {
    if (process.argv.find(value => value === '--test') !== undefined) {
        await test();
        closeProgram(0);
        return;
    }
    await init();
    main_loop: while (true) {
        if (wAIfu.is_paused === true) {
            await new Promise((resolve) => setTimeout(() => resolve(), 500));
            continue main_loop;
        }
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
        if (UiWebSocket !== null && UiWebSocket.readyState === UiWebSocket.OPEN) {
            if (is_chat)
                UiWebSocket.send('MSG_CHAT ' + JSON.stringify({ "user": pseudo, "text": handled }));
            else
                UiWebSocket.send('MSG_IN ' + handled);
        }
        const identifier = (is_chat)
            ? `[CHAT] ${pseudo}`
            : sender;
        let additional_memories = '';
        let prompt = `${identifier}: ${handled}\n${wAIfu.character.char_name}:`;
        let response = await sendToLLM(flattenMemory(additional_memories) + prompt);
        if (response === null) {
            await handleCommand('!reload');
            continue main_loop;
        }
        if (wAIfu.is_paused === true) {
            await new Promise((resolve) => setTimeout(() => resolve(), 500));
            continue main_loop;
        }
        let displayed = (is_chat)
            ? ` "${handled}".${response}`
            : response;
        let filtered_content = null;
        const verify_result = verifyText(displayed);
        if (verify_result.result === true) {
            filtered_content = verify_result.matched;
            response = ' Filtered.\n';
        }
        put(`${wAIfu.character.char_name}:${displayed}`);
        if (UiWebSocket !== null && UiWebSocket.readyState === UiWebSocket.OPEN) {
            UiWebSocket.send('MSG_OUT ' + JSON.stringify({
                "text": displayed,
                "filtered": filtered_content
            }));
        }
        if (filtered_content === null) {
            const new_memory = `${identifier}: ${input}\n${wAIfu.character.char_name}:${response}`;
            wAIfu.memory.short_term.push(new_memory);
            wAIfu.dialog_transcript += new_memory;
        }
        else {
            displayed = ' Filtered.';
        }
        const tts_response = await sendToTTS(displayed);
        if (tts_response === null) {
            await reinit();
        }
        continue;
    }
}
async function init() {
    process.title = 'w-AI-fu Console';
    wAIfu.package = await getPackage();
    put(`w-AI-fu ${wAIfu.package.version}\n`);
    if (await shouldUpdate() === true) {
        let update_success = await update();
        if (update_success === true) {
            greenPut('Successfully updated w-AI-fu.\n');
            closeProgram(ErrorCode.None);
        }
        warnPut('Error: Failed to update w-AI-fu.\n');
    }
    if (fs.existsSync('./ffmpeg/ffmpeg.exe') === false) {
        errPut('Critical Error: Could not find ffmpeg. ffmpeg is not included in the w-AI-fu repository by default because of its size (> 100MB). If you cloned the repository, download the latest release instead:\nhttps://github.com/wAIfu-DEV/w-AI-fu/releases\n');
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
        wAIfu.bad_words = await getBadWords();
    }
    put('Getting audio devices ...\n');
    getDevices();
    put('Spawning subprocesses ...\n');
    await summonProcesses(wAIfu.input_mode);
    if (wAIfu.config.read_live_chat) {
        put('Connecting to the Twitch API ...\n');
        connectTwitchChatWebSocket();
        await connectTwitchEventSub();
    }
    put('Starting WebUI ...\n');
    cproc.spawn('cmd.exe', ['/C', 'start index.html'], { cwd: './ui' });
    put('Loaded w-AI-fu.\n\n');
    put('Commands: !mode [text, voice], !say [...], !script [_.txt], !chat [on, off], !history, !char, !reset, !stop, !save, !debug, !reload\n');
    init_get();
}
async function reinit() {
    wAIfu.init_cycle++;
    put('Reinitializing ...\n');
    wAIfu.package = await getPackage();
    wAIfu.config = getConfig();
    wAIfu.chat_reader_initialized = false;
    wAIfu.live_chat = wAIfu.config.read_live_chat;
    wAIfu.input_mode = (wAIfu.config.is_voice_input)
        ? InputMode.Voice
        : InputMode.Text;
    wAIfu.character = getCharacter();
    wAIfu.memory.long_term = `(${wAIfu.character.char_persona})\n\n${wAIfu.character.example_dialogue}`;
    wAIfu.bad_words = [];
    if (wAIfu.config.filter_bad_words) {
        wAIfu.bad_words = await getBadWords();
    }
    put('Getting audio devices ...\n');
    getDevices();
    await summonProcesses(wAIfu.input_mode);
}
function flattenMemory(additional) {
    put("mem: " + wAIfu.memory.short_term.length + "\n");
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
    if (result === null && wAIfu.live_chat) {
        const { message, name } = await getChatOrNothing();
        is_mono: if (wAIfu.config.monologue === true && message === '' && name === '') {
            if (Math.random() < wAIfu.config.monologue_chance * 0.01) {
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
    if (chatmsg.name !== '' && wAIfu.config.chatter_blacklist.indexOf(chatmsg.name) !== -1) {
        debug(`Skipped message from blacklisted chatter.\n`);
        return { message: '', name: '' };
    }
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
    const PATH = '../config.json';
    checkFileIntegrityLoose(PATH, JSON.stringify(new Config()));
    const buff = fs.readFileSync(PATH);
    const obj = JSON.parse(buff.toString());
    return checkConfigFields(obj);
}
function checkConfigFields(obj) {
    let was_modified = false;
    if (isOfClass(obj, wAIfu.config) === false) {
        for (let key of Object.keys(wAIfu.config)) {
            if (key in obj === false) {
                obj[key] = wAIfu.config[key];
                was_modified = true;
            }
            ;
        }
    }
    if (was_modified === true) {
        fs.writeFileSync('../config.json', JSON.stringify(obj));
    }
    return obj;
}
async function checkFileIntegrityStrict(path) {
    if (fs.existsSync(path) === false) {
        errPut(`Critical Error: Missing ${path} file. File integrity of the program might be compromised, w-AI-fu will try to reinstall itself.`);
        const answer = await ReadlineInterface.question(`\nContinue? (Y/n): `);
        if (/|Y|y/g.test(answer)) {
            let update_success = await update();
            if (update_success === false) {
                errPut('Critical Error: w-AI-fu failed to reinstall itself. Please reinstall w-AI-fu from https://github.com/wAIfu-DEV/w-AI-fu/releases\n');
                closeProgram(ErrorCode.Critical);
            }
            greenPut('Successfully reinstalled w-AI-fu.\n');
            closeProgram(ErrorCode.None);
        }
        else {
            closeProgram(ErrorCode.Critical);
        }
    }
}
async function checkFileIntegrityLoose(path, content_if_lost) {
    if (fs.existsSync(path) === false) {
        warnPut(`Error: Missing ${path} file. w-AI-fu will try to a create new one.\n`);
        fs.writeFileSync(path, content_if_lost);
    }
}
async function getPackage() {
    const PATH = './package.json';
    checkFileIntegrityStrict(PATH);
    const buff = fs.readFileSync(PATH);
    return JSON.parse(buff.toString());
}
async function getBadWords() {
    if (wAIfu.config.filter_bad_words === false)
        return [];
    const PATH = './bad_words/bad_words_b64';
    checkFileIntegrityStrict(PATH);
    let fcontent = fs.readFileSync(PATH).toString();
    const buff = Buffer.from(fcontent, 'base64');
    const tostr = buff.toString('utf-8');
    return tostr.split(/\r\n|\n/g).map((v) => { return v.toLowerCase(); });
}
function getCharacter() {
    const PATH = `../UserData/characters/${wAIfu.config.character_name}.json`;
    checkFileIntegrityLoose(PATH, JSON.stringify(new Character()));
    const buff = fs.readFileSync(PATH);
    const char = JSON.parse(buff.toString());
    return checkCharacterFields(char);
}
function checkCharacterFields(obj) {
    let was_modified = false;
    if (isOfClass(obj, wAIfu.character) === false) {
        for (let key of Object.keys(wAIfu.character)) {
            if (key in obj === false) {
                obj[key] = wAIfu.character[key];
                was_modified = true;
            }
            ;
        }
    }
    if (was_modified === true) {
        fs.writeFileSync(`../UserData/characters/${wAIfu.config.character_name}.json`, JSON.stringify(obj));
    }
    return obj;
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
    await awaitProcessLoaded(LLM, 'LLM');
    put('Loaded LLM.\n');
    await awaitProcessLoaded(TTS, 'TTS');
    put('Loaded TTS.\n');
    if (mode === InputMode.Voice) {
        put('Loaded STT.\n');
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
    LLM.process = cproc.spawn('python', ['novel_llm.py', String(PORT_LLM + PORT_OFFSET)], { cwd: './novel', env: { NAI_USERNAME: USR, NAI_PASSWORD: PSW }, detached: DEBUGMODE, shell: DEBUGMODE });
    readPythonStdOut(LLM, 'LLM');
    readPythonStdErr(LLM, 'LLM');
    LLM.running = true;
}
async function startTTS() {
    if (TTS.running)
        return;
    const USR = getAuth('novel_user');
    const PSW = getAuth('novel_pass');
    const tts_provider = 'novel_tts.py';
    TTS.process = cproc.spawn('python', [tts_provider, String(PORT_TTS + PORT_OFFSET)], { cwd: './novel', env: { NAI_USERNAME: USR, NAI_PASSWORD: PSW }, detached: DEBUGMODE, shell: DEBUGMODE });
    readPythonStdOut(TTS, 'TTS');
    readPythonStdErr(TTS, 'TTS');
    TTS.running = true;
}
async function startSTT() {
    if (STT.running)
        return;
    STT.process = cproc.spawn('python', ['speech.py'], { cwd: './speech', detached: DEBUGMODE, shell: DEBUGMODE });
    readPythonStdOut(STT, 'STT');
    readPythonStdErr(STT, 'STT');
    STT.running = true;
}
function sendToLLM(prompt) {
    return new Promise(async (resolve) => {
        let p_resolved = false;
        const payload = JSON.stringify({ data: [
                prompt,
                (wAIfu.character.craziness !== undefined) ? wAIfu.character.craziness : 0.5,
                (wAIfu.character.creativity !== undefined) ? wAIfu.character.creativity : 0.5,
                (wAIfu.character.max_output_length !== undefined) ? wAIfu.character.max_output_length : 120,
                (wAIfu.config.use_clio_model !== undefined) ? wAIfu.config.use_clio_model : false
            ] });
        debug('sending: ' + payload + '\n');
        setTimeout(() => {
            if (p_resolved === true)
                return;
            p_resolved = true;
            warnPut('Error: Timed out while awaiting LLM\'s response.\n');
            resolve(null);
            return;
        }, 45000);
        let post_query;
        try {
            post_query = await fetch(LLM.api_url + '/api', {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: payload
            });
        }
        catch (e) {
            warnPut('Error: Could not contact the LLM subprocess.\n');
            console.log(e);
            if (p_resolved === true)
                return;
            p_resolved = true;
            resolve(null);
            return;
        }
        const text = await post_query.text();
        if (text[0] !== undefined && text[0] !== '{') {
            warnPut('Error: Received incorrect json from LLM.\n');
            console.log(text);
            if (p_resolved === true)
                return;
            p_resolved = true;
            resolve(null);
            return;
        }
        const data = JSON.parse(text);
        const raw = Buffer.from(data.data[0], 'base64');
        debug('received: ' + JSON.stringify({ "data": raw.toString('utf-8') }) + '\n');
        let response = raw.toString('utf-8').replace(/\n.*/, '');
        if (response.slice(-1) !== '\n')
            response = response + '\n';
        p_resolved = true;
        resolve(response);
        return;
    });
}
async function handleCommand(command) {
    if (wAIfu.config.parrot_mode && command.startsWith('!', 0) === false) {
        if (wAIfu.input_mode === InputMode.Voice)
            put(command + '\n');
        UiWebSocket.send(`MSG_IN ${command}`);
        UiWebSocket.send(`MSG_OUT ${JSON.stringify({ "text": command, "filtered": null })}`);
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
            const tts_response = await sendToTTS(command.substring('!say '.length, undefined));
            if (tts_response === null) {
                await handleCommand('!reload');
            }
            return null;
        }
        case '!testvoice': {
            let voice = command.substring('!testvoice '.length, undefined).split('###')[0];
            if (voice === undefined)
                return null;
            const tts_response = await sendToTTS(command.substring('!testvoice '.length + voice.length + '###'.length, undefined), voice);
            if (tts_response === null) {
                await handleCommand('!reload');
            }
            return null;
        }
        case '!testaudio': {
            let device_index = command.substring('!testaudio '.length, undefined).split('###')[0];
            if (device_index === undefined)
                return null;
            const tts_response = await sendToTTS(command.substring('!testaudio '.length + device_index.length + '###'.length, undefined), '', parseInt(device_index));
            if (tts_response === null) {
                await handleCommand('!reload');
            }
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
            if (fs.existsSync(fpath_resolved) === false) {
                warnPut(`Error: Cannot open file ${fpath_resolved}\n`);
                return null;
            }
            let fcontent = fs.readFileSync(fpath_resolved).toString();
            const lines = fcontent.split('-');
            for (let line of lines) {
                let tts_response = await sendToTTS(line);
                if (tts_response === null) {
                    await handleCommand('!reload');
                }
            }
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
        case '!sing': {
            const song_name = command.substring('!sing '.length, undefined).trim();
            const vocals = `../UserData/songs/${song_name}_vocals.wav`;
            const instrumentals = `../UserData/songs/${song_name}_instrumentals.wav`;
            if (fs.existsSync(vocals) === false) {
                warnPut('Error: Could not find file: ' + vocals);
                return null;
            }
            if (fs.existsSync(instrumentals) === false) {
                warnPut('Error: Could not find file: ' + instrumentals);
                return null;
            }
            let player1 = cproc.spawn('python', ['./singing/sing.py', vocals, String(wAIfu.config.audio_device)], { cwd: './', detached: DEBUGMODE, shell: DEBUGMODE });
            let player2 = cproc.spawn('python', ['./singing/sing.py', instrumentals, String(wAIfu.config.audio_device_other)], { cwd: './', detached: DEBUGMODE, shell: DEBUGMODE });
            player1.stdout.on('data', (data) => put(data));
            player1.stderr.on('data', (data) => put(data));
            player2.stdout.on('data', (data) => put(data));
            player2.stderr.on('data', (data) => put(data));
            await new Promise((resolve) => {
                let player1_closed = false;
                let player2_closed = false;
                player1.on('close', () => {
                    player1_closed = true;
                    if (player2_closed === true)
                        resolve();
                    return;
                });
                player2.on('close', () => {
                    player2_closed = true;
                    if (player1_closed === true)
                        resolve();
                    return;
                });
            });
            return null;
        }
        default:
            put('Invalid command.\n');
            return null;
    }
}
function sanitizeText(text) {
    return text.replaceAll(/[^a-zA-Z .,?!0-9\+\-\%\*\/\_]/g, '');
}
function verifyText(text) {
    if (wAIfu.config.filter_bad_words === false)
        return { result: false, matched: [] };
    let matched_result = false;
    let matched_words = [];
    const low_text = text.toLowerCase();
    for (const bw of wAIfu.bad_words) {
        if (low_text.includes(bw)) {
            put('FILTER MATCHED: "' + bw + '" in "' + text + '"\n');
            matched_words.push(bw);
            matched_result = true;
        }
    }
    return { result: matched_result, matched: matched_words };
}
function sendToTTS(say, test_voice = '', test_device = null) {
    return new Promise(async (resolve) => {
        exposeCaptions(say);
        let promise_resolved = false;
        let default_voice = 'galette';
        let voice = (wAIfu.character.voice == '')
            ? default_voice
            : wAIfu.character.voice;
        if (test_voice !== '')
            voice = test_voice;
        let device = test_device;
        const payload = JSON.stringify({ data: [say, voice, device] });
        debug('sending: ' + payload + '\n');
        setTimeout(() => {
            if (promise_resolved === true)
                return;
            promise_resolved = true;
            warnPut('Error: Timed out while awaiting TTS\'s response.\n');
            exposeCaptions('');
            resolve();
            return;
        }, 45000);
        const post_query = await fetch(TTS.api_url + '/api', {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: payload
        }).catch((e) => {
            warnPut('Error: Could not contact the TTS subprocess.\n');
            console.log(e);
            if (promise_resolved === true)
                return;
            promise_resolved = true;
            exposeCaptions('');
            resolve(null);
            return;
        });
        if (promise_resolved === true)
            return;
        const text = await post_query.text();
        if (text[0] !== undefined && text[0] !== '{') {
            warnPut('Error: Received incorrect json from TTS.\n');
            console.log(text);
            if (promise_resolved === true)
                return;
            promise_resolved = true;
            exposeCaptions('');
            resolve(null);
            return;
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
        return;
    });
}
async function getLastTwitchChat() {
    let data = { message: '', name: '' };
    if (wAIfu.config.chatter_blacklist.includes(wAIfu.new_chat_usr))
        return data;
    data.message = wAIfu.new_chat_msg;
    data.name = wAIfu.new_chat_usr;
    return data;
}
function init_get() {
    const e = (input) => {
        wAIfu.command_queue.push(input);
        debug('Added: ' + input + ' to queue.\n');
    };
    ReadlineInterface.on('line', e);
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
                return;
            }, wAIfu.config.chat_read_timeout_sec * 1000);
        }
        const checkQueue = () => {
            if (resolved)
                return;
            if (wAIfu.init_cycle !== old_init_cycle) {
                resolved = true;
                resolve(null);
                return;
            }
            else if (wAIfu.command_queue.length > 0) {
                debug(`Consuming queue element: ${wAIfu.command_queue[0]}\n`);
                text = wAIfu.command_queue.shift();
                if (text === undefined)
                    text = null;
                resolved = true;
                resolve(text);
                return;
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
                return;
            }, wAIfu.config.chat_read_timeout_sec * 1000);
        }
        const checkFile = () => {
            if (resolved)
                return;
            if (wAIfu.init_cycle !== old_init_cycle) {
                resolved = true;
                resolve(null);
                return;
            }
            else if (fs.existsSync('./speech/input.txt')) {
                text = fs.readFileSync('./speech/input.txt').toString('utf8');
                resolved = true;
                fs.unlinkSync('./speech/input.txt');
                resolve(text);
                return;
            }
            else if (wAIfu.command_queue.length > 0) {
                debug(`Consuming queue element: ${wAIfu.command_queue[0]}\n`);
                text = wAIfu.command_queue.shift();
                if (text === undefined)
                    text = null;
                resolved = true;
                resolve(text);
                return;
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
    if (response === null) {
        await handleCommand('!reload');
        return;
    }
    ;
    displayed = response;
    let verify_result = verifyText(response);
    if (verify_result.result === true) {
        filtered_txt = verify_result.matched;
    }
    put(`${wAIfu.character.char_name}:${displayed}`);
    exposeCaptions(displayed);
    if (UiWebSocket !== null && UiWebSocket.readyState === UiWebSocket.OPEN) {
        UiWebSocket.send('MSG_OUT ' + JSON.stringify({ "text": displayed, "filtered": filtered_txt }));
    }
    if (filtered_txt === null) {
        const new_memory = `${prompt}${displayed}`;
        wAIfu.memory.short_term.push(new_memory);
        wAIfu.dialog_transcript += new_memory;
    }
    else {
        displayed = ' Filtered.';
    }
    const tts_reponse = await sendToTTS(displayed);
    if (tts_reponse === null) {
        await handleCommand('!reload');
        return;
    }
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
                return;
            });
            let success = proc.process.kill(2);
            if (!success)
                warnPut(`Error: Could not kill process ${proc_name}.\n`);
            else
                proc.running = false;
        }
        else {
            resolve();
            return;
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
    if (UiWebSocket !== null && UiWebSocket.readyState === UiWebSocket.OPEN) {
        UiWebSocket.send('ERROR ' + text);
    }
}
function greenPut(text) {
    process.stdout.write('\x1B[0;32m' + text + '\x1B[0m');
}
function debug(text) {
    if (wAIfu.is_debug || DEBUGMODE)
        process.stdout.write('\x1B[1;30m' + text + '\x1B[0m');
}
function exposeCaptions(text) {
    fs.writeFileSync('./captions/transcript.txt', text);
}
function retreiveCharacters() {
    const PATH = '../UserData/characters';
    if (fs.existsSync(PATH) === false) {
        warnPut(`Error: Could not find directory ${PATH} , w-AI-fu will try to create a new one.`);
        fs.mkdirSync(PATH, { recursive: true });
    }
    const files = fs.readdirSync(PATH);
    let result = [];
    for (let f of files) {
        if (f.endsWith('.json'))
            result.push(f);
    }
    return result;
}
function awaitProcessLoaded(proc, proc_name) {
    return new Promise((resolve) => {
        let loaded = false;
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
                await fetch(proc.api_url + '/loaded');
                loaded = true;
                resolve();
                return;
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
    if (fs.existsSync('./devices/devices.json') === false) {
        errPut('Critical Error: Could not create a Python child process. This may be due to a missing Python installation, or a missing PATH system environment variable; Either can be fixed by (re)installing Python with the "Add Python 3.10 to PATH" enabled.');
        closeProgram(ErrorCode.Critical);
    }
    const data = fs.readFileSync('./devices/devices.json');
    wAIfu.audio_devices = JSON.parse(data.toString('utf8'));
}
function getAuth(what) {
    const PATH = `../UserData/auth/${what}.txt`;
    checkFileIntegrityLoose(PATH, '');
    return basic_decode(fs.readFileSync(PATH));
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
    if (fs.existsSync('../.dev') === true)
        return false;
    let query;
    try {
        query = await fetch('https://api.github.com/repos/wAIfu-DEV/w-AI-fu/tags');
    }
    catch (e) {
        warnPut('Error: Could not contact github while trying to get latest version.\n');
        return false;
    }
    let data;
    try {
        data = await query.json();
    }
    catch {
        warnPut('Error: Could not retreive latest version from github.\n');
        return false;
    }
    if (typeof data !== 'object' || data === null || data === undefined) {
        warnPut('Error: Fetched invalid data from github while trying to retreive latest version.\n');
        return false;
    }
    let latest_version = data[0];
    if (latest_version === undefined
        || latest_version === null
        || typeof latest_version !== "object") {
        warnPut('Error: Fetched invalid data from github while trying to retreive latest version.\n');
        return false;
    }
    if ("name" in latest_version && wAIfu.package.version !== latest_version["name"]) {
        const new_version = String(latest_version["name"]).replaceAll(/[^0-9\.\,\-]/g, '');
        const answer = await ReadlineInterface.question(`\nA new version of w-AI-fu is available (${new_version})\nDo you want to install it? (Y/n): `);
        return /|Y|y/g.test(answer);
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
    if (v === null || v === undefined) {
        errPut('rejected.\n');
        return;
    }
    put('\x1B[0;32m' + 'passed.\n' + '\x1B[0m');
    put('\x1B[0;32m' + 'Successfuly passed all tests.\n' + '\x1B[0m');
}
function isOfClass(x, y) {
    if (x === undefined || x === null) {
        if (x === y)
            return true;
        return false;
    }
    if (typeof x !== "object") {
        if (typeof x === typeof y)
            return true;
        return false;
    }
    for (let key of Object.keys(y)) {
        if (key in x === false)
            return false;
    }
    return true;
}
function connectTwitchChatWebSocket() {
    TwitchChatWebSocket = new ws_1.default('wss://irc-ws.chat.twitch.tv:443');
    let ws = TwitchChatWebSocket;
    let chat_started = false;
    ws.on('open', () => {
        ws.send(`PASS oauth:${getAuth('twitch_oauth')}`);
        ws.send(`NICK ${wAIfu.config.twitch_channel_name}`);
        ws.send(`JOIN #${wAIfu.config.twitch_channel_name}`);
    });
    ws.on('close', (code, reason) => {
        put(`Closed Twitch Chat WebSocket with message: ${code} ${reason.toString()}`);
        TwitchChatWebSocket = null;
    });
    ws.on('error', (err) => {
        if (err.message === 'Connection to remote host was lost.') {
            errPut('Critical Error: Could not connect to the Twitch API, it may be due to an incorrect Oauth token.');
            closeProgram(ErrorCode.Critical);
        }
        else {
            errPut('Critical Error:' + err.message);
            closeProgram(ErrorCode.Critical);
        }
    });
    ws.on('message', (data, _) => {
        let msg = data.toString();
        if (msg.includes('PING')) {
            ws.send('PONG');
            return;
        }
        if (msg.includes(':End of /NAMES list')) {
            chat_started = true;
            return;
        }
        if (chat_started) {
            let last_msg = msg.split(/\r\n|\n/g)[0];
            wAIfu.new_chat_usr = Array.from(last_msg.matchAll(/(?<=^:)(.*?)(?=!)/g))[0][0].toString();
            wAIfu.new_chat_msg = Array.from(last_msg.matchAll(RegExp(`(?<=PRIVMSG #${wAIfu.config.twitch_channel_name} :)(.*)`, 'g')))[0][0].toString();
        }
    });
}
async function getTwitchAppAccessToken() {
    let req = await fetch(`https://id.twitch.tv/oauth2/token`
        + `?client_id=${getAuth('twitchapp_clientid')}`
        + `&client_secret=${getAuth('twitchapp_secret')}`
        + `&grant_type=client_credentials`, {
        method: 'POST'
    });
    let resp = await req.json();
    return resp["access_token"];
}
function getTwitchUserAccessToken() {
    let redirect_url = `https://id.twitch.tv/oauth2/authorize`
        + `?client_id=${getAuth('twitchapp_clientid')}`
        + `^&redirect_uri=http://localhost:${PORT_TWITCH_AUTH_CALLBACK}/callback`
        + `^&response_type=token+id_token`
        + `^&scope=channel:read:subscriptions+moderator:read:followers+bits:read+openid`;
    cproc.spawn('cmd.exe', ['/C', 'start ' + redirect_url]);
}
async function getTwitchUID(login, apptoken) {
    let req = await fetch(`https://api.twitch.tv/helix/users?login=${login}`, {
        method: 'GET',
        headers: {
            "Authorization": "Bearer " + apptoken,
            "Client-Id": getAuth('twitchapp_clientid')
        }
    });
    let resp = await req.json();
    greenPut('Obtained Twitch UID\n');
    return resp["data"][0]["id"];
}
function subscribeToEventSub(event_name, version, condition = {}, user_token, session_id) {
    fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + user_token,
            "Client-Id": getAuth('twitchapp_clientid'),
        },
        body: JSON.stringify({
            "type": event_name,
            "version": version,
            "condition": condition,
            "transport": {
                "method": "websocket",
                "session_id": session_id
            }
        })
    })
        .catch((reason) => {
        console.log(reason);
    });
}
const EVENT_FOLLOW = "channel.follow";
const EVENT_SUBSCRIBE = "channel.subscribe";
const EVENT_GIFT_SUB = "channel.subscription.gift";
const EVENT_BITS = "channel.cheer";
const EVENT_RAID = "channel.raid";
function subscribeToEvents(user_id, user_token, session_id) {
    subscribeToEventSub(EVENT_FOLLOW, "2", { "broadcaster_user_id": user_id, "moderator_user_id": user_id }, user_token, session_id);
    subscribeToEventSub(EVENT_SUBSCRIBE, "1", { "broadcaster_user_id": user_id }, user_token, session_id);
    subscribeToEventSub(EVENT_GIFT_SUB, "1", { "broadcaster_user_id": user_id }, user_token, session_id);
    subscribeToEventSub(EVENT_BITS, "1", { "broadcaster_user_id": user_id }, user_token, session_id);
    subscribeToEventSub(EVENT_RAID, "1", { "to_broadcaster_user_id": user_id }, user_token, session_id);
}
async function connectTwitchEventSub() {
    let apptoken = await getTwitchAppAccessToken();
    let user_id = await getTwitchUID(wAIfu.config.twitch_channel_name, apptoken);
    let user_token = '';
    let user_id_token = '';
    let ws_session_id = '';
    let callback_script = `
    <head>
        <title>redirecting...</title>
    </head>
    <body>
        <script>
            let payload = window.location.hash.replace('#', '');
            fetch('${HOST_PATH}:${PORT_TWITCH_AUTH_CALLBACK}/token?' + payload)
            .then(() => {
                window.close();
            });
        </script>
    </body>
    `;
    const DEFAULT_EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws';
    let latest_eventsub_ws_url = DEFAULT_EVENTSUB_WS_URL;
    let create_ws = (url = null) => {
        TwitchEventSubWebSocket = new ws_1.default((url === null)
            ? DEFAULT_EVENTSUB_WS_URL
            : url);
        let ws = TwitchEventSubWebSocket;
        ws.on('open', () => {
            const reconnect = (url) => {
                ws.close();
                setTimeout(() => create_ws(url), 0);
            };
            ws.on('ping', () => ws.pong());
            ws.on('message', (data, _is_bin) => {
                let obj = JSON.parse(data.toString());
                const MSG_WELCOME = "session_welcome";
                const MSG_KEEPALIVE = "session_keepalive";
                const MSG_RECONNECT = "session_reconnect";
                const MSG_NOTIFICATION = "notification";
                const msg_type = obj["metadata"]["message_type"];
                switch (msg_type) {
                    case MSG_WELCOME: {
                        greenPut('Successfuly connected to Twitch EventSub WebSocket.\n');
                        ws_session_id = obj["payload"]["session"]["id"];
                        return;
                    }
                    case MSG_KEEPALIVE: {
                        return;
                    }
                    case MSG_RECONNECT: {
                        warnPut('Received reconnection message from Twich EventSub WebSocket.\n');
                        latest_eventsub_ws_url = obj["payload"]["session"]["reconnect_url"];
                        reconnect(latest_eventsub_ws_url);
                        return;
                    }
                    case MSG_NOTIFICATION: {
                        handleTwitchEvent(obj);
                        return;
                    }
                    default:
                        break;
                }
            });
            ws.on('error', (err) => {
                errPut('Error: Twitch Events WebSocket experienced an error.');
                console.log(err);
                reconnect(latest_eventsub_ws_url);
            });
            ws.on('close', (code, reason) => {
                put(`Closed Twitch Events WebSocket with message: ${code} ${reason.toString()}`);
                TwitchEventSubWebSocket = null;
            });
        });
    };
    create_ws();
    let server = http.createServer();
    server.listen(PORT_TWITCH_AUTH_CALLBACK, HOST_PATH, () => {
        const REQUEST_SUCCESS = 200;
        const REQUEST_FAILURE = 400;
        server.on('request', (req, res) => {
            if (req.url?.includes('/callback', 0)) {
                res.statusCode = REQUEST_SUCCESS;
                res.end(callback_script);
            }
            else if (req.url?.includes('/token', 0)) {
                greenPut('Received Auth token from Twitch API\n');
                let url_query = url.parse(req.url, true).query;
                user_token = url_query.access_token?.toString();
                user_id_token = url_query.id_token?.toString();
                subscribeToEvents(user_id, user_token, ws_session_id);
                res.statusCode = REQUEST_SUCCESS;
                res.end('');
                server = undefined;
            }
            else {
                res.statusCode = REQUEST_FAILURE;
                res.end('');
            }
        });
    });
    getTwitchUserAccessToken();
}
function handleTwitchEvent(obj) {
    const event_type = obj["metadata"]["subscription_type"];
    const user_name = obj["payload"]["event"]["user_name"];
    switch (event_type) {
        case EVENT_FOLLOW: {
            wAIfu.command_queue.push(`!say Thank you ${user_name} for following my channel!`);
            return;
        }
        case EVENT_SUBSCRIBE: {
            let was_gifted = obj["payload"]["event"]["is_gift"];
            if (was_gifted === true)
                return;
            let sub_tier = obj["payload"]["event"]["tier"];
            wAIfu.command_queue.push(`!say Thank you ${user_name} for your tier ${sub_tier} sub to my channel!`);
            return;
        }
        case EVENT_GIFT_SUB: {
            let anonymous = obj["payload"]["event"]["is_anonymous"];
            let sub_tier = obj["payload"]["event"]["tier"];
            let total = obj["payload"]["event"]["total"];
            wAIfu.command_queue.push(`!say Thank you ${(anonymous) ? 'anonymous' : user_name} for your ${total} tier ${sub_tier} gifted subs to my channel!`);
            return;
        }
        case EVENT_BITS: {
            let anonymous = obj["payload"]["event"]["is_anonymous"];
            let bits = obj["payload"]["event"]["bits"];
            wAIfu.command_queue.push(`!say Thank you ${(anonymous) ? 'anonymous' : user_name} for the ${bits} bits!`);
            return;
        }
        case EVENT_RAID: {
            let from = obj["payload"]["event"]["from_broadcaster_user_name"];
            wAIfu.command_queue.push(`!say Thank you ${from} for the raid!`);
            return;
        }
        default:
            break;
    }
}
