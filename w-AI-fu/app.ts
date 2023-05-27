/*
    File: app.ts

    Created by: wAIfu-DEV
    Contributors:

    Description:
        Core of the application,
        Responible for IO logic, management of python subprocesses,
            and com with the webui.
    
    Entry Point: main()

    TODO: Maube split this up in multiple module files, this is getting to the 
        point of being way too big.

    License: GPLv3 see ../LICENSE.txt and end of file.
*/

/** Expose additional logs + show python shells */
const DEBUGMODE: boolean = false;

import * as fs from 'fs';
import * as cproc from 'child_process';
import WebSocket, { WebSocketServer } from 'ws';
import * as crypt from 'crypto';

//const fetch = require('node-fetch');
const { resolve } = require('path');
const readline = require('readline/promises');

const readline_interface = readline.createInterface(process.stdin, process.stdout);

enum ErrorCode {
    None,
    UnHandeld,
    InvalidValue,
    HTTPError,
}

const wss = new WebSocketServer({ host: '127.0.0.1', port: 7870 });
let ws: WebSocket|null = null;
wss.on('connection', function connection(socket: WebSocket) {
    debug('connected ws server.\n');
    ws = socket;
    ws.on('error', console.error);
    ws.on('message', (data) => handleSocketMessage(data));
});

/**
 * Handles webui messages received from websocket.
 * @param data raw message data
 */
async function handleSocketMessage(data: any): Promise<void> {
    const message: string = String(data);
    let type: string = message.split(' ')[0];
    if (type === undefined) type = message;
    const payload: string = (type.length === message.length)
                            ? ''
                            : message.substring(type.length + 1, undefined);
    
    debug(`ws received: ${message}\n`);
    switch (type) {
        case 'MSG': {
            wsMSG(payload);
            return;
        }
        case 'AUTH_GET': {
            wsAUTH_GET();
            return;
        }
        case 'AUTH_SET': {
            wsAUTH_SET(payload);
            return;
        }
        case 'LATEST': {
            wsLATEST();
            return;
        }
        case 'CONFIG': {
            wsCONFIG(payload);
            return;
        }
        case 'CHARA': {
            wsCHARA(payload);
            return;
        }
        case 'DEVICE': {
            wsDEVICE(payload);
            return;
        }
        case 'INTERRUPT': {
            wsINTERRUPT();
            return;
        }
        default:
            return;
    };
}

/** Handles reception of prompt or command from webui */
function wsMSG(data: string): void {
    put(`${data}\n`);
    wAIfu.command_queue.push(data);
}

/** Handles interruption of TTS from the webui */
function wsINTERRUPT(): void {
    fetch(TTS.api_url + '/interrupt')
    .then(() => {
        fs.writeFileSync('./captions/transcript.txt', '');
    });
}

/** Sends the initial data to the webui */
function wsLATEST(): void {
    ws!.send('LATEST ' + JSON.stringify({
        "config": wAIfu.config,
        "character": wAIfu.character,
        "chars_list": retreiveCharacters(),
        "version": wAIfu.package.version,
        "audio_devices": wAIfu.audio_devices
    }));
}

/** Handles config changes from the webui */
function wsCONFIG(data: string): void {
    const obj = JSON.parse(data);

    wAIfu.config = obj;
    fs.writeFileSync('../config.json', data);

    /*const config_field = obj.name;
    let new_value = obj.value;

    if (new_value === 'on') new_value = true;
    if (new_value === 'off') new_value = false;

    debug(`changed value of ${config_field} to: ${new_value}\n`);

    modifyConfig(config_field, new_value);*/
    wAIfu.should_reload = true;
}

/**
 * Sends the auth informations to the webui.
 * Should probably be encrypted but I have no idea how to ;3
 */
function wsAUTH_GET(): void {
    ws!.send('AUTH ' + JSON.stringify({
        "novel-mail": getAuth('novel_user'),
        "novel-pass": getAuth('novel_pass'),
        "twitch-oauth": getAuth('twitch_oauth'),
        "playht-auth": getAuth('play-ht_auth'),
        "playht-user": getAuth('play-ht_user')
    }));
}

/** Handles changes to the auth informations from webui */
function wsAUTH_SET(data: string): void {
    const obj = JSON.parse(data);

    setAuth('novel_user', obj["novel-mail"]);
    setAuth('novel_pass', obj["novel-pass"]);
    setAuth('twitch_oauth', obj["twitch-oauth"]);
    setAuth('play-ht_auth', obj["playht-auth"]);
    setAuth('play-ht_user', obj["playht-user"]);
    wAIfu.should_reload = true;
}

/** Handles changes to the character from the webui */
function wsCHARA(data: string): void {
    const obj = JSON.parse(data);
    fs.writeFileSync(`../UserData/characters/${obj.char_name}.json`, data);
}

/** Handles change of audio device from webui */
function wsDEVICE(data: string): void {
    const obj = JSON.parse(data);
    wAIfu.audio_devices = obj;
}

/** Available Input modes, might be expanded later. */
enum InputMode {
    /** Standard text input via console or webui */
    Text,
    /** Voice input, see ./speech/speech.py */
    Voice
}

/** see ./package.json */
class Package {
    /** Version of the program, I like to increase the number after a long day
     * of doing nothing :3 */
    version: string = '';
}

/** see ../config.json */
class Config {
    /** Name of the character to be loaded at initialization, see ../UserData/characters/ */
    character_name: string = '';
    /** Name of the user of the program, ideally will make it so the LLM identifies correctly the user */
    user_name: string = '';
    /** Weither to set the InputMode to Voice at initialization */
    is_voice_input: boolean = false;
    /** Makes it so the input is directed to the TTS */
    parrot_mode: boolean = false;
    /** Weither to read chat messages after input timeout */
    read_live_chat: boolean = false;
    /** Weither to start ranting about topics of interest after input/chat timeout */
    monologue: boolean = false;
    /** Weither to user Play.ht instead of NovelAI for the TTS */
    tts_use_playht: boolean = false;
    /** Name of the Twitch channel from which to read the chat messages */
    twitch_channel_name: string = '';
    /** Time to wait before reading chat messages, if read_live_chat is true */
    chat_read_timeout_sec: number = 2;
    /** Weither you want to filter out bad stuff, highly recommended if you plan on streaming with it */
    filter_bad_words: boolean = true;
    /** Index of the selected audio device, -1 uses the default audio device */
    audio_device: number = -1;
}

/** see ../UserData/characters/*.json */
class Character {
    /** Name of the character */
    char_name: string = '';
    /** Seed of the voice the TTS will use */
    voice: string = '';
    /** Short description of the character */
    char_persona: string = '';
    /** Longer dialogue used to give context and format */
    example_dialogue: string = '';
    topics: string[] = [];
    craziness: number = 0.5;
    creativity: number = 0.5;
}

/** Used to prepend the prompt in order to give more context to the LLM */
class Memory {
    /** Constant long-term memory */
    long_term: string = '';
    /** Limited short-term memory */
    short_term: string[] = [];
}

/** Global state of the application */
class wAIfuApp {
    /** Weither the application has finished initializing */
    started: boolean = false;
    /** Weither the application is in debug mode (similar to DEBUGMODE I have no idea why it's duplicated :3 ) */
    is_debug: boolean = false;
    /** Weither the application is currently reading chat messages */
    live_chat: boolean = false;
    /** Weither the python chat message reader is initialized */
    chat_reader_initialized: boolean = false;
    input_skipped: boolean = false;
    /** List of bad words to check the output against */
    bad_words: string[] = [];
    /** Queue of user inputs and commands */
    command_queue: string[] = [];
    /** Last received chat message, if next message is similar, it will be skipped */
    last_chat_msg = '';
    /** Plain-text transcript of the conversation with the LLM. Does not get purged as opposed to the memory */
    dialog_transcript = '';
    input_mode: InputMode = InputMode.Text;
    config: Config = new Config();
    package: Package = new Package();
    character: Character = new Character();
    memory: Memory = new Memory();
    /** Dictionnary of available audio devices */
    audio_devices: any = {};
    /** Keeps track of number of reloads */
    init_cycle: number = 0;
    /** Weither to reload on next input loop */
    should_reload: boolean = false;
}
/** Singleton of the application's state */
const wAIfu: wAIfuApp = new wAIfuApp();

// Python subprocesses class
// Communication is done via requests to localhost servers
class SubProc {
    process: cproc.ChildProcess|null = null;
    api_url: string = '';
    running: boolean = false;
    constructor(port: string) {
        this.api_url = port;
    }
}

/** Subprocess responsible for the NovelAI LLM, see ./novel/novel_llm.py */
const LLM: SubProc =  new SubProc('http://127.0.0.1:7840');
/** Subprocess responsible for the NovelAI TTS, see ./novel/novel_tts.py */
const TTS: SubProc =  new SubProc('http://127.0.0.1:7850');
/** Subprocess responsible for the Twitch Chat Reading, see ./novel/novel_tts.py */
const CHAT: SubProc = new SubProc('http://127.0.0.1:7830');
/** Subprocess responsible for the Speech recognition, see ./novel/novel_tts.py */
const STT: SubProc =  new SubProc('');

main();
/** Entry point, main I/O loop */
async function main(): Promise<void> {
    /** Fetches the required data and initializes the subprocesses */
    await init();

    main_loop: while (true) {

        /** Input from the user (or twitch chat) */
        const inputObj = await getInput(wAIfu.input_mode);
        if (inputObj === null) continue main_loop;

        if (wAIfu.should_reload === true) {
            await handleCommand('!reload');
            wAIfu.should_reload = false;
        }

        const { input, sender, pseudo } = inputObj;
        const is_chat: boolean = sender === 'CHAT';
        const handled: string|null = (is_chat)
                                     ? input
                                     : await handleCommand(input);
        /** If input has been handled, continue */
        if (handled === null || handled === '') {
            wAIfu.input_skipped = true;
            continue main_loop;
        }

        /** Send input via websocket */
        if (ws !== null && ws.readyState === ws.OPEN) {
            if (is_chat)
                ws.send('MSG_CHAT ' + JSON.stringify({ "user": pseudo, "text": handled }));
            else
                ws.send('MSG_IN ' + handled);
        }

        /** Name of the sender */
        const identifier: string = (is_chat)
                                   ? `[CHAT] ${pseudo}`
                                   : sender;
        /** Memory placed between Long-term and Short-term memory */
        let additional_memories: string = (is_chat)
                                          ? ''
                                          : getChatMemories(pseudo);
        /** Final prompt before merge with memory */
        let prompt: string = `${identifier}: ${handled}\n${wAIfu.character.char_name}:`;
        let response: string = await sendToLLM(flattenMemory(additional_memories) + prompt);

        /** String that will eventually be displayed in console, spoken by TTS */
        let displayed: string = (is_chat)
                                ? ` ${pseudo} said "${handled}".${response}`
                                : response;
        /** if !null, content will be displayed in a [ FILTERED ] box in webui */
        let filtered_content: string|null = null;

        /** Bad words checking */
        if (verifyText(displayed)) {
            filtered_content = displayed;
            displayed = ' Filtered.\n';
            response = ' Filtered.\n';
        }

        put(`${wAIfu.character.char_name}:${displayed}`);
        exposeCaptions(displayed);

        /** Send output via websocket */
        if (ws !== null && ws.readyState === ws.OPEN) {
            ws.send('MSG_OUT ' + JSON.stringify({
                "text": displayed,
                "filtered": filtered_content
            }));
        }

        if (filtered_content === null) {
            /** new string to add to short-term memory */
            const new_memory: string = `${identifier}: ${input}\n${wAIfu.character.char_name}:${response}`

            wAIfu.memory.short_term.push(new_memory);
            wAIfu.dialog_transcript += new_memory;
            if (is_chat) /** Adds memory to chat user database, see ../UserData/data/chat_user_db.csv */
                addChatMemory(pseudo, new_memory);
        }

        /** Speaks the response */
        await sendToTTS(displayed);
        exposeCaptions('');
        continue;
    }
}

/** Loads the application at launch */
async function init(): Promise<void> {
    process.title = 'w-AI-fu Console';

    wAIfu.package = getPackage();
    put(`w-AI-fu ${wAIfu.package.version}\n`);

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
    cproc.execSync('start ./ui/index.html');

    put('Loaded w-AI-fu.\n\n');
    put('Commands: !mode [text, voice], !say [...], !script [_.txt], !chat [on, off], !history, !char, !reset, !stop, !save, !debug, !reload\n');

    init_get();
}

/** Reloads the application after config changes, might not be the optimal way of doing it but it works :3 */
async function reinit() {
    wAIfu.init_cycle++;
    put('Reinitializing ...\n');
    wAIfu.package = getPackage();
    wAIfu.config = getConfig();
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

/**
 * Returns a string from the current memory of the character
 * @param additional memories to be placed between the long term and short term memories before flattening
 * @returns {string} memories as a single multi-line string
*/
function flattenMemory(additional: string): string {
    // Remove old short-term memory
    // Prevents character dillution
    // Increase the right-hand number to allow for greater memory capacity
    // at the cost of answers less faithul to the character.
    while (wAIfu.memory.short_term.length > 4) {
        wAIfu.memory.short_term.shift();
    }
    return wAIfu.memory.long_term
           + additional
           + wAIfu.memory.short_term.join('');
}

/**
 * Checks if any auth files are empty
 * @returns {boolean} true if passed check, false if failed.
*/
function isAuthCorrect(): boolean {
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

/**
 * Manages the reception of input, be it Text, Voice or from Twitch chat
 * @param mode Can either be InputMode.Text or InputMode.Voice
 * @returns null: if encountered a non-critical error, input: plain text content, sender: either '{{USER}}' or 'CHAT', pseudo: chatter's name
 */
async function getInput(mode: InputMode): Promise<{input:string,sender:string,pseudo:string}|null> {
    /** Keeps track of init_cycle at start of getInput() call,
     * we want to make sure that if the application restarts, the getInput()
     * function returns and does not continue.*/
    const old_init_cycle: number = wAIfu.init_cycle;

    if(wAIfu.input_skipped === false) {
        put('> ');
    }
    wAIfu.input_skipped = false;

    let result: string|null = null;
    let sender: string = wAIfu.config.user_name;
    let pseudo: string = '';

    switch (mode) {
        case InputMode.Text:
            result = await textGet();
            break;
        case InputMode.Voice:
            result = await voiceGet();
            break;
    }

    /** If application has been restarted between start and now, dip */
    if (old_init_cycle !== wAIfu.init_cycle) {
        debug('discarded input because of init cycle change.\n');
        return null;
    }

    if (!isAuthCorrect()) {
        put('Failed auth validation, could not continue.\n');
        return null;
    }

    wAIfu.started = true; // Prevents input timeout on first input

    /** Needed for some obscure reason
    *   Because I can't seem to figure out how to initialize the damn
    *    thing from the python script. */
    if (wAIfu.chat_reader_initialized === false && (wAIfu.live_chat === true)) {
        if (wAIfu.config.twitch_channel_name === '') {
            put('Critical Error: Could not initialize the Twitch Chat Reader as the provided twitch channel name is empty.\n');
            closeProgram(1);
        }
        debug('initializing Twitch Chat Reader.\n');
        fetch(CHAT.api_url + '/run', {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ data: [wAIfu.config.twitch_channel_name] })
        }).catch((e: any) => {
            if (e.errno !== undefined && e.errno === 'ECONNRESET') {
                /** I know this is basically a war crime but the error is going
                 * to happen either way weither I want it or not :3 */
                debug('Error: There was an error with the fetch request to /run\n');
            }
        });
        wAIfu.chat_reader_initialized = true;
    }

    /** If is timeout, read twitch chat */
    if (result === null && wAIfu.live_chat) {
        const { message, name } = await getChatOrNothing();

        /** got no new message, start ranting about a topic of interest */
        if (wAIfu.config.monologue === true && message === '' && name === '') {
            //if (Math.random() < 1/2) {
                let rdm = Math.random();
                let topic = wAIfu.character.topics[ Math.round((wAIfu.character.topics.length - 1) * rdm) ];
                if (topic === undefined) {
                    put('Critical Error: topic was undefined\n')
                    closeProgram(1);
                }
                return { input: `!mono ${topic}`, sender: 'USER', pseudo: '' };
            //}
        }

        result = message;
        pseudo = name;
        sender = 'CHAT';
    }
    /** User input is still null, not supposed to happen */
    if (result === null) {
        put('Critical error: input is invalid.\n');
        closeProgram(1); process.exit(1);
    }
    return { input: result, sender, pseudo };
}

/**
 * @returns a NEW chat message or empty message if no new message has been found
 */
async function getChatOrNothing(): Promise<{message:string,name:string}> {
    // If can't read chat messages
    if (wAIfu.live_chat === false) {
        return { message: '', name: '' };
    }
    // Get latest twitch chat message
    let chatmsg = await getLastTwitchChat();

    /** Uses regex to strip the text of any unwanted chars */
    chatmsg.message = sanitizeText(chatmsg.message);

    /** If same message, skip */
    if (wAIfu.last_chat_msg === chatmsg.message) {
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

function getPackage() {
    const buff = fs.readFileSync('./package.json');
    return JSON.parse(buff.toString());
}

function getBadWords() {
    const fcontent = fs.readFileSync('./bad_words/bad_words_b64').toString();
    const buff = Buffer.from(fcontent, 'base64');
    const tostr = buff.toString('utf-8');
    return tostr.split(/\r\n|\n/g).map((v) => { return v.toLowerCase() });
}

function getCharacter() {
    const buff = fs.readFileSync(`../UserData/characters/${wAIfu.config.character_name}.json`);
    return JSON.parse(buff.toString());
}

/**
 * Loads and awaits loading of subprocesses
 * @param mode either InputMode.Text or InputMode.Voice
 */
async function summonProcesses(mode: InputMode): Promise<void> {
    if (!LLM.running) await startLLM();
    if (!TTS.running) await startTTS();

    switch (mode) {
        case InputMode.Text:
            break;
        case InputMode.Voice:
            if (!STT.running) await startSTT();
            break;
    }
    if (wAIfu.live_chat) {
        if (!CHAT.running) await startLiveChat();
    }

    await awaitProcessLoaded(LLM);
    put('Loaded LLM.\n');
    await awaitProcessLoaded(TTS);
    put('Loaded TTS.\n');
    if (mode === InputMode.Voice) {
        put('Loaded STT.\n');
    }
    if (wAIfu.live_chat) {
        await awaitProcessLoaded(CHAT);
        put('Loaded CHAT.\n');
    }
}

async function startLLM() {
    if (LLM.running) return;

    const USR = getAuth('novel_user');
    const PSW = getAuth('novel_pass');

    LLM.process = cproc.spawn('python', ['novel_llm.py'],
        { cwd: './novel', env: { NAI_USERNAME: USR, NAI_PASSWORD: PSW }, detached: DEBUGMODE, shell: DEBUGMODE });
    LLM.running = true;
}

async function startTTS() {
    if (TTS.running) return;

    const USR = (wAIfu.config.tts_use_playht) ? getAuth('play-ht_user') : getAuth('novel_user');
    const PSW = (wAIfu.config.tts_use_playht) ? getAuth('play-ht_auth') : getAuth('novel_pass');

    const tts_provider = (wAIfu.config.tts_use_playht) ? 'playht_tts.py' : 'novel_tts.py';

    TTS.process = cproc.spawn('python', [tts_provider],
        { cwd: './novel', env: { NAI_USERNAME: USR, NAI_PASSWORD: PSW }, detached: DEBUGMODE, shell: DEBUGMODE });
    TTS.running = true;
}

async function startLiveChat() {
    if (CHAT.running) return;

    const OAUTH = getAuth('twitch_oauth');

    CHAT.process = cproc.spawn('python', ['twitchchat.py'], { cwd: './twitch', env: { OAUTH: OAUTH }, detached: DEBUGMODE, shell: DEBUGMODE });
    CHAT.running = true;
}

async function startSTT() {
    if (STT.running) return;

    STT.process = cproc.spawn('python', ['speech.py'], { cwd: './speech', detached: DEBUGMODE, shell: DEBUGMODE });
    STT.running = true;
}

/**
 * Send dialog history + prompt to LLM
 * @param prompt final prompt to be read by the LLM, contains character definition, example dialogue, memories.
 */
async function sendToLLM(prompt: string): Promise<string> {

    const payload = JSON.stringify({ data: [prompt, wAIfu.character.craziness, wAIfu.character.creativity] });
    debug('sending: ' + payload + '\n');

    const post_query = await fetch(LLM.api_url + '/api', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload
    }).catch((e: any) => {
        put('Error: Could not contact the LLM subprocess.\n');
        console.log(e);
        closeProgram(ErrorCode.HTTPError);
    });
    const text = await post_query!.text();
    if (text[0] !== undefined && text[0] !== '{') {
        put('Error: Received incorrect json from LLM.\n');
        console.log(text);
        closeProgram(ErrorCode.InvalidValue);
    }
    const data = JSON.parse(text);
    const raw = Buffer.from(data.data[0], 'base64');

    debug('received: ' + JSON.stringify(
        { "data": raw.toString('utf-8') }) + '\n');

    /** Remove anything after a newline character, LLM might try to impersonate USER */
    let response = raw.toString('utf-8').replace(/\n.*/, '');

    /** Make sure response ends with \n */
    if (response.slice(-1) !== '\n')
        response = response + '\n';
    return response;
}

/**
 * Logic for command handling, if not a command will return original argument, chat messages should by no mean be routed through this!
 * @param command user input, either plain text or command (starts with '!')
 * @returns string if input is plain text, null if input has been consumed as a command.
*/
async function handleCommand(command: string): Promise<string|null> {
    /** Parrot mode implementation */
    if (wAIfu.config.parrot_mode && command.startsWith('!', 0) === false) {
        if (wAIfu.input_mode === InputMode.Voice) put(command + '\n');
        ws!.send(`MSG_IN ${command}`);
        ws!.send(`MSG_OUT ${JSON.stringify({ "text": command, "filtered": null })}`);
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
        case '!reset': {
            // Removes short-term memory
            // Basically resets the character to initial state.
            wAIfu.memory.short_term = [];
            return null;
        }
        case '!history': {
            // Prints dialogue hostory, I think you might have guessed that by the name
            put('\x1B[1;30m' + wAIfu.dialog_transcript + '\n' + '\x1B[0m');
            return null;
        }
        case '!memory': {
            // Prints the current memory of the character
            put('\x1B[1;30m' + flattenMemory('') + '\n' + '\x1B[0m');
            return null;
        }
        case '!debug': {
            // Shows additional debug informations (json data etc...)
            wAIfu.is_debug = true;
            return null;
        }
        case '!stop': {
            // Closes application
            closeProgram(0);
            return null;
        }
        case '!char': {
            // Similar to !history, but prints character infos from .json file
            put(`\x1B[1;30m(${wAIfu.character.char_persona})\n\n${wAIfu.character.example_dialogue}\x1B[0m\n`);
            return null;
        }
        case '!save': {
            /** Saves the dialogue history to a file, see ../UserData/saved/ */
            const f = '../UserData/saved/log_' + new Date().getTime().toString() + '.txt';
            put('\x1B[1;30m' + 'saved to: ' + resolve(f) + '\n' + '\x1B[0m');
            fs.writeFileSync(f, wAIfu.dialog_transcript);
            return null;
        }
        case '!script': {
            /** Will read out the content of the script, see ../UserData/scripts/ */
            const fpath = command.substring('!script '.length, undefined).trim();
            const fpath_resolved = `../UserData/scripts/${fpath}`;
            if (!fs.existsSync(fpath_resolved)) {
                put(`Error: Cannot open file ${fpath_resolved}\n`);
                return null;
            }
            let fcontent = fs.readFileSync(fpath_resolved).toString();
            const lines = fcontent.split('-');
            for (let line of lines)
                await sendToTTS(line);
            return null;
        }
        case '!reload': {
            /** Reinitializes the application */
            await closeSubProcesses();
            await reinit();
            return null;
        }
        case '!mode': {
            /** changes the input mode between text and voice */
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
            /** activates the reading of twitch chat messages */
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
            /** Prints the current config of w-AI-fu */
            console.log(wAIfu.config);
            return null;
        }
        case '!state': {
            /** Prints the current global state of w-AI-fu */
            console.log(wAIfu);
            return null;
        }
        case '!mono': {
            const topic = command.substring('!mono '.length, undefined).trim();
            put(`[ ${wAIfu.character.char_name} starts talking about ${topic}. ]\n`)
            await monologue(topic);
            return null;
        }
        default:
            /** What are you doing here ??? */
            put('Invalid command.\n');
            return null;
    }
}

/**
 * Removes any potentially harmful characters, keeps standard alphabet, punctuation and numbers
 * @param text unsanitized text
 * @returns safe, warm, sanitized text
 */
function sanitizeText(text: string): string {
    return text.replaceAll(/[^a-zA-Z .,?!1-9]/g, '');
}

/**
 * Checks for bad words inside of response text
 * @param text content to be verified
 * @returns true if found instance of bad word, false if passed
 */
function verifyText(text: string): boolean {
    const low_text = text.toLowerCase();
    for (const bw of wAIfu.bad_words) {
        if (low_text.includes(bw)) {
            put('FILTER MATCHED: "' + bw + '" in "' + text + '"\n');
            return true;
        }
    }
    return false;
}

/**
 * Sends LLM output to the TTS generator
 * @param say text spoken by the TTS
 */
async function sendToTTS(say: string): Promise<void> {
    let default_voice = (wAIfu.config.tts_use_playht === true)
        ? 'Scarlett'
        : 'galette';
    
    let voice = (wAIfu.character.voice == '')
        ? default_voice
        : wAIfu.character.voice;

    const payload = JSON.stringify({ data: [say, voice] });
    debug('sending: ' + payload + '\n');

    const post_query = await fetch(TTS.api_url + '/api', {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: payload
    }).catch((e: any) => {
        put('Error: Could not contact the TTS subprocess.\n');
        console.log(e);
        closeProgram(ErrorCode.HTTPError);
    });
    const text = await post_query!.text();
    if (text[0] !== undefined && text[0] !== '{') {
        put('Error: Received incorrect json from TTS.\n');
        console.log(text);
        closeProgram(ErrorCode.InvalidValue);
    }
    const data = JSON.parse(text);
    debug('received: ' + JSON.stringify(data) + '\n');

    /** If audio device is not capable of being used as ouput */
    if (data["message"] === 'AUDIO_ERROR') {
        put('Error: Could not play TTS because of invalid output audio device.\n');
    }
    if (data["message"] === 'GENERATION_ERROR') {
        put('Error: Could not play TTS because of an error with the NovelAI API.\n');
    }
}

/** Retreives the last message from the twich chat, see ./twitch/twitchchat.py */
async function getLastTwitchChat(): Promise<any> {
    const get_query = await fetch(CHAT.api_url + '/api').catch((e: any) => {
        put('Error: Could not contact the CHAT subprocess.\n');
        console.log(e);
        closeProgram(ErrorCode.HTTPError);
    });
    const text = await get_query!.text();
    if (text[0] !== undefined && text[0] !== '{') {
        put('Error: Received incorrect json from CHAT.\n');
        console.log(text);
        closeProgram(ErrorCode.InvalidValue);
    }
    const data = JSON.parse(text);
    debug('received: ' + JSON.stringify(data) + '\n');
    return data;
}

/** Initializes the interface for readline */
function init_get(): void {
    const e = (input: string) => {
        wAIfu.command_queue.push(input);
        debug('Added: ' + input + ' to queue.\n');
    };
    readline_interface.on('line', e);
}

/**
 * Get Text input from user, with timeout if enabled in config
 * @returns null if timeout or skip, string if success 
 */
function textGet(): Promise<string|null> {
    debug('Awaiting text input ...\n');
    return new Promise<string|null>(
        (resolve) => {
            const old_init_cycle: number = wAIfu.init_cycle;
            let text: string|null = null;
            let resolved: boolean = false;

            /** Timeout of n seconds before reading chat message */
            if (wAIfu.live_chat && wAIfu.started) {
                setTimeout(() => {
                    if (resolved) return;
                    debug('Input timeout.\n');
                    resolved = true;
                    resolve(text);
                }, wAIfu.config.chat_read_timeout_sec * 1000);
            }

            /** Will check the command queue every .25s and resolve with first in queue if present */
            const checkQueue = () => {
                if (resolved) return;

                if (wAIfu.init_cycle !== old_init_cycle) {
                    resolved = true;
                    resolve(null);
                } else if (wAIfu.command_queue.length > 0) {
                    debug(`Consuming queue element: ${wAIfu.command_queue[0]}\n`);
                    text = wAIfu.command_queue.shift()!;
                    if (text === undefined) text = null;
                    resolved = true;
                    resolve(text);
                } else {
                    setTimeout(checkQueue, 250);
                }
            };
            checkQueue();
        }
    );
}

/**
 * Get Voice input from user, with timeout if enabled in config
 * @returns null if timeout or skip, string if success 
 */
function voiceGet(): Promise<string|null> {
    return new Promise<string|null>(
        (resolve) => {
            const old_init_cycle: number = wAIfu.init_cycle;
            let text: string|null = null;
            let resolved: boolean = false;

            if (wAIfu.live_chat && wAIfu.started) {
                setTimeout(() => {
                    if (resolved) return;
                    resolved = true;
                    resolve(text);
                }, wAIfu.config.chat_read_timeout_sec * 1000);
            }

            // My god what have I done
            const checkFile = () => {
                if (resolved) return;

                if (wAIfu.init_cycle !== old_init_cycle) {
                    resolved = true;
                    resolve(null);
                } else if (fs.existsSync('./speech/input.txt')) {
                    text = fs.readFileSync('./speech/input.txt').toString('utf8');
                    fs.unlinkSync('./speech/input.txt');
                    resolved = true;
                    resolve(text);
                } else if (wAIfu.command_queue.length > 0) {
                    debug(`Consuming queue element: ${wAIfu.command_queue[0]}\n`);
                    text = wAIfu.command_queue.shift()!;
                    if (text === undefined) text = null;
                    resolved = true;
                    resolve(text);
                } else {
                    setTimeout(checkFile, 250);
                }
            };
            checkFile();
        }
    );
}

/**
 * Makes the character start talking about a certain topic (typically picked from its topics of interest)
 * @param topic topic the character's rant should be about
 */
async function monologue(topic: string): Promise<void> {
    const prompt = `[${wAIfu.character.char_name} starts talking about ${topic}]\n${wAIfu.character.char_name}:`;
    let displayed = '';
    let filtered_txt: string|null = null
    const response: string = await sendToLLM(flattenMemory('') + prompt);
    displayed = response;
    if (verifyText(response) === true) {
        filtered_txt = response;
        displayed = ' Filtered.\n';
    }
    put(`${wAIfu.character.char_name}:${displayed}`);
    exposeCaptions(displayed);
    if (ws !== null && ws.readyState === ws.OPEN) {
        ws!.send('MSG_OUT ' + JSON.stringify({ "text": displayed, "filtered": filtered_txt }));
    }
    if (filtered_txt === null) {
        const new_memory: string = `${prompt}${displayed}`;
        wAIfu.memory.short_term.push(new_memory);
        wAIfu.dialog_transcript += new_memory;
    }
    await sendToTTS(displayed);
    exposeCaptions('');
}

async function closeSubProcesses(): Promise<void> {
    /** This is a massacre 😱 */
    put('Killing subprocesses ...\n');
    await killProc(CHAT, 'CHAT');
    await killProc(LLM, 'LLM');
    await killProc(TTS, 'TTS');
    await killProc(STT, 'STT');
}

/**
 * Fully close subprocess
 * @param proc subprocess to close
 * @param proc_name name of the subprocess, for logging purposes
 */
function killProc(proc: SubProc, proc_name: string): Promise<void> {
    return new Promise<void>((resolve) => {
        if (proc.process !== null && proc.running) {
            proc.process.on('close', () => {
                put(`Closed ${proc_name}.\n`);
                proc.process = null;
                resolve();
            });
            let success = proc.process.kill(2);
            if (!success)
                put(`Error: Could not kill process ${proc_name}.\n`);
            else
                proc.running = false;
        } else {
            resolve();
        }
    });
}

/**
 * End the program
 * @param code error code
 * @returns your freedom
 */
function closeProgram(code: number = 0): void {
    closeSubProcesses();
    put('Exiting w.AI.fu\n');
    process.exit(code);
}

/**
 * Similar in function to C's puts(), lines must be explicitly terminated with \n
 * @param text text to display in the console
 */
function put(text: string): void {
    process.stdout.write(text);
}

/**
 * Similar to put(), but only works if is in debug mode
 * @param text text to display in the console
 */
function debug(text: string): void {
    if (wAIfu.is_debug || DEBUGMODE)
        process.stdout.write('\x1B[1;30m' + text + '\x1B[0m');
}

/**
 * Write the text to the './captions/transcript.txt' file.
 * @param text text to write to file
 */
function exposeCaptions(text: string): void {
    fs.writeFileSync('./captions/transcript.txt', text);
}

/**
 * Returns a string from the chat user's memories if present in database
 * @param user name of the chatter
 * @returns a multi-line string containing the memories of the user
 */
function getChatMemories(user: string): string {

    const db: Map<string,string[]> = fetchChatDatabase();
    const logs: string[]|undefined = db.get(user);
    let result: string = '';

    if (logs === undefined) return result;

    for (let s of logs) {
        result += Buffer.from(s, 'base64').toString('utf8');
    }
    return result;
}

/** Adds a memory to the chat user's database */
function addChatMemory(user: string, memory: string): void {
    const db: Map<string,string[]> = fetchChatDatabase();
    const logs: string[]|undefined = db.get(user);

    /** Memory is encoded in b64 to preserve the CSV file's formating without
     * having to sanitize the memory itself, a bit hacky but does the job */
    const b64_mem: string = Buffer.from(memory, 'utf8').toString('base64');

    if (logs === undefined) {
        db.set(user, [b64_mem]);
        return;
    };
    /** Remove old logs */
    while (logs.length > 3)
        logs.shift();

    logs.push(b64_mem);
    /** Write db back to file */
    updateChatDatabase(db);
}

/** Reads and parses the contents of the database */
function fetchChatDatabase(): Map<string,string[]> {
    let fcontent = fs.readFileSync('../UserData/data/chat_user_db.csv', { encoding: 'utf8' });
    return parseChatDatabase(fcontent);
}

/** Writes the database object back to the CSV file */
function updateChatDatabase(obj: Map<string,string[]>) {
    let s = flattenChatDatabase(obj);
    fs.writeFileSync('../UserData/data/chat_user_db.csv', s);
}

/** Parses the contents of the CSV file to a Map */
function parseChatDatabase(csv: string): Map<string,string[]> {
    const lines: string[] = csv.split(/\r\n|\n/);

    let csv_map: Map<string,string[]> = new Map();

    for (let i: number = 0; i < lines.length; ++i) {
        if (lines[i].trim() === '') break; /** handles \n before EOF (pretty common source of errors)*/
        let spl: string[] = lines[i].split(',');

        if (spl.length !== 5) {
            put(`Critical Error: Incorrect formating of chat_user_db.csv file at line ${i}. Expected line length of 5, got ${spl.length}\n`);
            closeProgram(1);
        }
        csv_map.set(spl[0], [ spl[1], spl[2], spl[3], spl[4] ]);
    }
    return csv_map;
}

/** Stringifies the Map before writing to CSV file */
function flattenChatDatabase(obj: Map<string,string[]>): string {
    let flat: string = '';
    for (let [key, value] of obj) {

        while(value.length > 4)
            value.shift();
        
        let line = key
        for (let s of value) {
            line += ',' + s;
        }
        flat += line + '\n';
    }
    return flat;
}

/** Get list of characters */
function retreiveCharacters(): string[] {
    const files = fs.readdirSync('../UserData/characters');
    let result: string[] = [];
    for (let f of files) {
        if (f.endsWith('.json')) result.push(f);
    }
    return result;
}

function modifyConfig(field: string, value: any): void {
    if (value === null || value === undefined) {
        throw new Error('Tried assigning invalid value to config field: ' + field);
    }
    if ((wAIfu.config as any)[field] === undefined) {
        throw new Error('Tried assigning value to inecistant config field: ' + field);
    }
    (wAIfu.config as any)[field] = value;
    fs.writeFileSync('../config.json', JSON.stringify(wAIfu.config));
}

/** Waits for the process to be responsive */
function awaitProcessLoaded(proc: SubProc): Promise<void> {
    return new Promise<void>(
        (resolve) => {
            let loaded = false;
            const checkloaded = async () => {
                if (loaded) return;
                try {
                    const r = await fetch(proc.api_url + '/loaded');
                    loaded = true;
                    resolve();
                    return;
                } catch(e) {
                    setTimeout(checkloaded, 500);
                }             
            };
            setTimeout(checkloaded, 500);
        }
    )
}

function getDevices(): void {
    if (fs.existsSync('./devices/devices.json')) {
        fs.unlinkSync('./devices/devices.json');
    }
    cproc.spawnSync('python', ['audio_devices.py'], { cwd: './devices' });
    const data = fs.readFileSync('./devices/devices.json');
    wAIfu.audio_devices = JSON.parse(data.toString('utf8'));
}

function getAuth(what: 'novel_user'|'novel_pass'|'twitch_oauth'|'play-ht_auth'|'play-ht_user'): string {
    return basic_decode(fs.readFileSync(`../UserData/auth/${what}.txt`));
}

function setAuth(what: 'novel_user'|'novel_pass'|'twitch_oauth'|'play-ht_auth'|'play-ht_user', data: string): void {
    fs.writeFileSync(`../UserData/auth/${what}.txt`, basic_encode(data));
}

/** Not crypto secure, but enough for local */
function basic_encode(data: string): string {
    let b64 = Buffer.from(data, 'utf8').toString('base64');
    let hex = Buffer.from(b64, 'base64').toString('hex');
    return hex;
}

function basic_decode(data: Buffer): string {
    let b64 = Buffer.from(data.toString(), 'hex').toString('base64');
    return Buffer.from(b64, 'base64').toString('utf8');
}

//#region GPL3_LICENSE
/** This work is under the GPLv3 License.

                    GNU GENERAL PUBLIC LICENSE
                       Version 3, 29 June 2007

 Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>
 Everyone is permitted to copy and distribute verbatim copies
 of this license document, but changing it is not allowed.

                            Preamble

  The GNU General Public License is a free, copyleft license for
software and other kinds of works.

  The licenses for most software and other practical works are designed
to take away your freedom to share and change the works.  By contrast,
the GNU General Public License is intended to guarantee your freedom to
share and change all versions of a program--to make sure it remains free
software for all its users.  We, the Free Software Foundation, use the
GNU General Public License for most of our software; it applies also to
any other work released this way by its authors.  You can apply it to
your programs, too.

  When we speak of free software, we are referring to freedom, not
price.  Our General Public Licenses are designed to make sure that you
have the freedom to distribute copies of free software (and charge for
them if you wish), that you receive source code or can get it if you
want it, that you can change the software or use pieces of it in new
free programs, and that you know you can do these things.

  To protect your rights, we need to prevent others from denying you
these rights or asking you to surrender the rights.  Therefore, you have
certain responsibilities if you distribute copies of the software, or if
you modify it: responsibilities to respect the freedom of others.

  For example, if you distribute copies of such a program, whether
gratis or for a fee, you must pass on to the recipients the same
freedoms that you received.  You must make sure that they, too, receive
or can get the source code.  And you must show them these terms so they
know their rights.

  Developers that use the GNU GPL protect your rights with two steps:
(1) assert copyright on the software, and (2) offer you this License
giving you legal permission to copy, distribute and/or modify it.

  For the developers' and authors' protection, the GPL clearly explains
that there is no warranty for this free software.  For both users' and
authors' sake, the GPL requires that modified versions be marked as
changed, so that their problems will not be attributed erroneously to
authors of previous versions.

  Some devices are designed to deny users access to install or run
modified versions of the software inside them, although the manufacturer
can do so.  This is fundamentally incompatible with the aim of
protecting users' freedom to change the software.  The systematic
pattern of such abuse occurs in the area of products for individuals to
use, which is precisely where it is most unacceptable.  Therefore, we
have designed this version of the GPL to prohibit the practice for those
products.  If such problems arise substantially in other domains, we
stand ready to extend this provision to those domains in future versions
of the GPL, as needed to protect the freedom of users.

  Finally, every program is threatened constantly by software patents.
States should not allow patents to restrict development and use of
software on general-purpose computers, but in those that do, we wish to
avoid the special danger that patents applied to a free program could
make it effectively proprietary.  To prevent this, the GPL assures that
patents cannot be used to render the program non-free.

  The precise terms and conditions for copying, distribution and
modification follow.

                       TERMS AND CONDITIONS

  0. Definitions.

  "This License" refers to version 3 of the GNU General Public License.

  "Copyright" also means copyright-like laws that apply to other kinds of
works, such as semiconductor masks.

  "The Program" refers to any copyrightable work licensed under this
License.  Each licensee is addressed as "you".  "Licensees" and
"recipients" may be individuals or organizations.

  To "modify" a work means to copy from or adapt all or part of the work
in a fashion requiring copyright permission, other than the making of an
exact copy.  The resulting work is called a "modified version" of the
earlier work or a work "based on" the earlier work.

  A "covered work" means either the unmodified Program or a work based
on the Program.

  To "propagate" a work means to do anything with it that, without
permission, would make you directly or secondarily liable for
infringement under applicable copyright law, except executing it on a
computer or modifying a private copy.  Propagation includes copying,
distribution (with or without modification), making available to the
public, and in some countries other activities as well.

  To "convey" a work means any kind of propagation that enables other
parties to make or receive copies.  Mere interaction with a user through
a computer network, with no transfer of a copy, is not conveying.

  An interactive user interface displays "Appropriate Legal Notices"
to the extent that it includes a convenient and prominently visible
feature that (1) displays an appropriate copyright notice, and (2)
tells the user that there is no warranty for the work (except to the
extent that warranties are provided), that licensees may convey the
work under this License, and how to view a copy of this License.  If
the interface presents a list of user commands or options, such as a
menu, a prominent item in the list meets this criterion.

  1. Source Code.

  The "source code" for a work means the preferred form of the work
for making modifications to it.  "Object code" means any non-source
form of a work.

  A "Standard Interface" means an interface that either is an official
standard defined by a recognized standards body, or, in the case of
interfaces specified for a particular programming language, one that
is widely used among developers working in that language.

  The "System Libraries" of an executable work include anything, other
than the work as a whole, that (a) is included in the normal form of
packaging a Major Component, but which is not part of that Major
Component, and (b) serves only to enable use of the work with that
Major Component, or to implement a Standard Interface for which an
implementation is available to the public in source code form.  A
"Major Component", in this context, means a major essential component
(kernel, window system, and so on) of the specific operating system
(if any) on which the executable work runs, or a compiler used to
produce the work, or an object code interpreter used to run it.

  The "Corresponding Source" for a work in object code form means all
the source code needed to generate, install, and (for an executable
work) run the object code and to modify the work, including scripts to
control those activities.  However, it does not include the work's
System Libraries, or general-purpose tools or generally available free
programs which are used unmodified in performing those activities but
which are not part of the work.  For example, Corresponding Source
includes interface definition files associated with source files for
the work, and the source code for shared libraries and dynamically
linked subprograms that the work is specifically designed to require,
such as by intimate data communication or control flow between those
subprograms and other parts of the work.

  The Corresponding Source need not include anything that users
can regenerate automatically from other parts of the Corresponding
Source.

  The Corresponding Source for a work in source code form is that
same work.

  2. Basic Permissions.

  All rights granted under this License are granted for the term of
copyright on the Program, and are irrevocable provided the stated
conditions are met.  This License explicitly affirms your unlimited
permission to run the unmodified Program.  The output from running a
covered work is covered by this License only if the output, given its
content, constitutes a covered work.  This License acknowledges your
rights of fair use or other equivalent, as provided by copyright law.

  You may make, run and propagate covered works that you do not
convey, without conditions so long as your license otherwise remains
in force.  You may convey covered works to others for the sole purpose
of having them make modifications exclusively for you, or provide you
with facilities for running those works, provided that you comply with
the terms of this License in conveying all material for which you do
not control copyright.  Those thus making or running the covered works
for you must do so exclusively on your behalf, under your direction
and control, on terms that prohibit them from making any copies of
your copyrighted material outside their relationship with you.

  Conveying under any other circumstances is permitted solely under
the conditions stated below.  Sublicensing is not allowed; section 10
makes it unnecessary.

  3. Protecting Users' Legal Rights From Anti-Circumvention Law.

  No covered work shall be deemed part of an effective technological
measure under any applicable law fulfilling obligations under article
11 of the WIPO copyright treaty adopted on 20 December 1996, or
similar laws prohibiting or restricting circumvention of such
measures.

  When you convey a covered work, you waive any legal power to forbid
circumvention of technological measures to the extent such circumvention
is effected by exercising rights under this License with respect to
the covered work, and you disclaim any intention to limit operation or
modification of the work as a means of enforcing, against the work's
users, your or third parties' legal rights to forbid circumvention of
technological measures.

  4. Conveying Verbatim Copies.

  You may convey verbatim copies of the Program's source code as you
receive it, in any medium, provided that you conspicuously and
appropriately publish on each copy an appropriate copyright notice;
keep intact all notices stating that this License and any
non-permissive terms added in accord with section 7 apply to the code;
keep intact all notices of the absence of any warranty; and give all
recipients a copy of this License along with the Program.

  You may charge any price or no price for each copy that you convey,
and you may offer support or warranty protection for a fee.

  5. Conveying Modified Source Versions.

  You may convey a work based on the Program, or the modifications to
produce it from the Program, in the form of source code under the
terms of section 4, provided that you also meet all of these conditions:

    a) The work must carry prominent notices stating that you modified
    it, and giving a relevant date.

    b) The work must carry prominent notices stating that it is
    released under this License and any conditions added under section
    7.  This requirement modifies the requirement in section 4 to
    "keep intact all notices".

    c) You must license the entire work, as a whole, under this
    License to anyone who comes into possession of a copy.  This
    License will therefore apply, along with any applicable section 7
    additional terms, to the whole of the work, and all its parts,
    regardless of how they are packaged.  This License gives no
    permission to license the work in any other way, but it does not
    invalidate such permission if you have separately received it.

    d) If the work has interactive user interfaces, each must display
    Appropriate Legal Notices; however, if the Program has interactive
    interfaces that do not display Appropriate Legal Notices, your
    work need not make them do so.

  A compilation of a covered work with other separate and independent
works, which are not by their nature extensions of the covered work,
and which are not combined with it such as to form a larger program,
in or on a volume of a storage or distribution medium, is called an
"aggregate" if the compilation and its resulting copyright are not
used to limit the access or legal rights of the compilation's users
beyond what the individual works permit.  Inclusion of a covered work
in an aggregate does not cause this License to apply to the other
parts of the aggregate.

  6. Conveying Non-Source Forms.

  You may convey a covered work in object code form under the terms
of sections 4 and 5, provided that you also convey the
machine-readable Corresponding Source under the terms of this License,
in one of these ways:

    a) Convey the object code in, or embodied in, a physical product
    (including a physical distribution medium), accompanied by the
    Corresponding Source fixed on a durable physical medium
    customarily used for software interchange.

    b) Convey the object code in, or embodied in, a physical product
    (including a physical distribution medium), accompanied by a
    written offer, valid for at least three years and valid for as
    long as you offer spare parts or customer support for that product
    model, to give anyone who possesses the object code either (1) a
    copy of the Corresponding Source for all the software in the
    product that is covered by this License, on a durable physical
    medium customarily used for software interchange, for a price no
    more than your reasonable cost of physically performing this
    conveying of source, or (2) access to copy the
    Corresponding Source from a network server at no charge.

    c) Convey individual copies of the object code with a copy of the
    written offer to provide the Corresponding Source.  This
    alternative is allowed only occasionally and noncommercially, and
    only if you received the object code with such an offer, in accord
    with subsection 6b.

    d) Convey the object code by offering access from a designated
    place (gratis or for a charge), and offer equivalent access to the
    Corresponding Source in the same way through the same place at no
    further charge.  You need not require recipients to copy the
    Corresponding Source along with the object code.  If the place to
    copy the object code is a network server, the Corresponding Source
    may be on a different server (operated by you or a third party)
    that supports equivalent copying facilities, provided you maintain
    clear directions next to the object code saying where to find the
    Corresponding Source.  Regardless of what server hosts the
    Corresponding Source, you remain obligated to ensure that it is
    available for as long as needed to satisfy these requirements.

    e) Convey the object code using peer-to-peer transmission, provided
    you inform other peers where the object code and Corresponding
    Source of the work are being offered to the general public at no
    charge under subsection 6d.

  A separable portion of the object code, whose source code is excluded
from the Corresponding Source as a System Library, need not be
included in conveying the object code work.

  A "User Product" is either (1) a "consumer product", which means any
tangible personal property which is normally used for personal, family,
or household purposes, or (2) anything designed or sold for incorporation
into a dwelling.  In determining whether a product is a consumer product,
doubtful cases shall be resolved in favor of coverage.  For a particular
product received by a particular user, "normally used" refers to a
typical or common use of that class of product, regardless of the status
of the particular user or of the way in which the particular user
actually uses, or expects or is expected to use, the product.  A product
is a consumer product regardless of whether the product has substantial
commercial, industrial or non-consumer uses, unless such uses represent
the only significant mode of use of the product.

  "Installation Information" for a User Product means any methods,
procedures, authorization keys, or other information required to install
and execute modified versions of a covered work in that User Product from
a modified version of its Corresponding Source.  The information must
suffice to ensure that the continued functioning of the modified object
code is in no case prevented or interfered with solely because
modification has been made.

  If you convey an object code work under this section in, or with, or
specifically for use in, a User Product, and the conveying occurs as
part of a transaction in which the right of possession and use of the
User Product is transferred to the recipient in perpetuity or for a
fixed term (regardless of how the transaction is characterized), the
Corresponding Source conveyed under this section must be accompanied
by the Installation Information.  But this requirement does not apply
if neither you nor any third party retains the ability to install
modified object code on the User Product (for example, the work has
been installed in ROM).

  The requirement to provide Installation Information does not include a
requirement to continue to provide support service, warranty, or updates
for a work that has been modified or installed by the recipient, or for
the User Product in which it has been modified or installed.  Access to a
network may be denied when the modification itself materially and
adversely affects the operation of the network or violates the rules and
protocols for communication across the network.

  Corresponding Source conveyed, and Installation Information provided,
in accord with this section must be in a format that is publicly
documented (and with an implementation available to the public in
source code form), and must require no special password or key for
unpacking, reading or copying.

  7. Additional Terms.

  "Additional permissions" are terms that supplement the terms of this
License by making exceptions from one or more of its conditions.
Additional permissions that are applicable to the entire Program shall
be treated as though they were included in this License, to the extent
that they are valid under applicable law.  If additional permissions
apply only to part of the Program, that part may be used separately
under those permissions, but the entire Program remains governed by
this License without regard to the additional permissions.

  When you convey a copy of a covered work, you may at your option
remove any additional permissions from that copy, or from any part of
it.  (Additional permissions may be written to require their own
removal in certain cases when you modify the work.)  You may place
additional permissions on material, added by you to a covered work,
for which you have or can give appropriate copyright permission.

  Notwithstanding any other provision of this License, for material you
add to a covered work, you may (if authorized by the copyright holders of
that material) supplement the terms of this License with terms:

    a) Disclaiming warranty or limiting liability differently from the
    terms of sections 15 and 16 of this License; or

    b) Requiring preservation of specified reasonable legal notices or
    author attributions in that material or in the Appropriate Legal
    Notices displayed by works containing it; or

    c) Prohibiting misrepresentation of the origin of that material, or
    requiring that modified versions of such material be marked in
    reasonable ways as different from the original version; or

    d) Limiting the use for publicity purposes of names of licensors or
    authors of the material; or

    e) Declining to grant rights under trademark law for use of some
    trade names, trademarks, or service marks; or

    f) Requiring indemnification of licensors and authors of that
    material by anyone who conveys the material (or modified versions of
    it) with contractual assumptions of liability to the recipient, for
    any liability that these contractual assumptions directly impose on
    those licensors and authors.

  All other non-permissive additional terms are considered "further
restrictions" within the meaning of section 10.  If the Program as you
received it, or any part of it, contains a notice stating that it is
governed by this License along with a term that is a further
restriction, you may remove that term.  If a license document contains
a further restriction but permits relicensing or conveying under this
License, you may add to a covered work material governed by the terms
of that license document, provided that the further restriction does
not survive such relicensing or conveying.

  If you add terms to a covered work in accord with this section, you
must place, in the relevant source files, a statement of the
additional terms that apply to those files, or a notice indicating
where to find the applicable terms.

  Additional terms, permissive or non-permissive, may be stated in the
form of a separately written license, or stated as exceptions;
the above requirements apply either way.

  8. Termination.

  You may not propagate or modify a covered work except as expressly
provided under this License.  Any attempt otherwise to propagate or
modify it is void, and will automatically terminate your rights under
this License (including any patent licenses granted under the third
paragraph of section 11).

  However, if you cease all violation of this License, then your
license from a particular copyright holder is reinstated (a)
provisionally, unless and until the copyright holder explicitly and
finally terminates your license, and (b) permanently, if the copyright
holder fails to notify you of the violation by some reasonable means
prior to 60 days after the cessation.

  Moreover, your license from a particular copyright holder is
reinstated permanently if the copyright holder notifies you of the
violation by some reasonable means, this is the first time you have
received notice of violation of this License (for any work) from that
copyright holder, and you cure the violation prior to 30 days after
your receipt of the notice.

  Termination of your rights under this section does not terminate the
licenses of parties who have received copies or rights from you under
this License.  If your rights have been terminated and not permanently
reinstated, you do not qualify to receive new licenses for the same
material under section 10.

  9. Acceptance Not Required for Having Copies.

  You are not required to accept this License in order to receive or
run a copy of the Program.  Ancillary propagation of a covered work
occurring solely as a consequence of using peer-to-peer transmission
to receive a copy likewise does not require acceptance.  However,
nothing other than this License grants you permission to propagate or
modify any covered work.  These actions infringe copyright if you do
not accept this License.  Therefore, by modifying or propagating a
covered work, you indicate your acceptance of this License to do so.

  10. Automatic Licensing of Downstream Recipients.

  Each time you convey a covered work, the recipient automatically
receives a license from the original licensors, to run, modify and
propagate that work, subject to this License.  You are not responsible
for enforcing compliance by third parties with this License.

  An "entity transaction" is a transaction transferring control of an
organization, or substantially all assets of one, or subdividing an
organization, or merging organizations.  If propagation of a covered
work results from an entity transaction, each party to that
transaction who receives a copy of the work also receives whatever
licenses to the work the party's predecessor in interest had or could
give under the previous paragraph, plus a right to possession of the
Corresponding Source of the work from the predecessor in interest, if
the predecessor has it or can get it with reasonable efforts.

  You may not impose any further restrictions on the exercise of the
rights granted or affirmed under this License.  For example, you may
not impose a license fee, royalty, or other charge for exercise of
rights granted under this License, and you may not initiate litigation
(including a cross-claim or counterclaim in a lawsuit) alleging that
any patent claim is infringed by making, using, selling, offering for
sale, or importing the Program or any portion of it.

  11. Patents.

  A "contributor" is a copyright holder who authorizes use under this
License of the Program or a work on which the Program is based.  The
work thus licensed is called the contributor's "contributor version".

  A contributor's "essential patent claims" are all patent claims
owned or controlled by the contributor, whether already acquired or
hereafter acquired, that would be infringed by some manner, permitted
by this License, of making, using, or selling its contributor version,
but do not include claims that would be infringed only as a
consequence of further modification of the contributor version.  For
purposes of this definition, "control" includes the right to grant
patent sublicenses in a manner consistent with the requirements of
this License.

  Each contributor grants you a non-exclusive, worldwide, royalty-free
patent license under the contributor's essential patent claims, to
make, use, sell, offer for sale, import and otherwise run, modify and
propagate the contents of its contributor version.

  In the following three paragraphs, a "patent license" is any express
agreement or commitment, however denominated, not to enforce a patent
(such as an express permission to practice a patent or covenant not to
sue for patent infringement).  To "grant" such a patent license to a
party means to make such an agreement or commitment not to enforce a
patent against the party.

  If you convey a covered work, knowingly relying on a patent license,
and the Corresponding Source of the work is not available for anyone
to copy, free of charge and under the terms of this License, through a
publicly available network server or other readily accessible means,
then you must either (1) cause the Corresponding Source to be so
available, or (2) arrange to deprive yourself of the benefit of the
patent license for this particular work, or (3) arrange, in a manner
consistent with the requirements of this License, to extend the patent
license to downstream recipients.  "Knowingly relying" means you have
actual knowledge that, but for the patent license, your conveying the
covered work in a country, or your recipient's use of the covered work
in a country, would infringe one or more identifiable patents in that
country that you have reason to believe are valid.

  If, pursuant to or in connection with a single transaction or
arrangement, you convey, or propagate by procuring conveyance of, a
covered work, and grant a patent license to some of the parties
receiving the covered work authorizing them to use, propagate, modify
or convey a specific copy of the covered work, then the patent license
you grant is automatically extended to all recipients of the covered
work and works based on it.

  A patent license is "discriminatory" if it does not include within
the scope of its coverage, prohibits the exercise of, or is
conditioned on the non-exercise of one or more of the rights that are
specifically granted under this License.  You may not convey a covered
work if you are a party to an arrangement with a third party that is
in the business of distributing software, under which you make payment
to the third party based on the extent of your activity of conveying
the work, and under which the third party grants, to any of the
parties who would receive the covered work from you, a discriminatory
patent license (a) in connection with copies of the covered work
conveyed by you (or copies made from those copies), or (b) primarily
for and in connection with specific products or compilations that
contain the covered work, unless you entered into that arrangement,
or that patent license was granted, prior to 28 March 2007.

  Nothing in this License shall be construed as excluding or limiting
any implied license or other defenses to infringement that may
otherwise be available to you under applicable patent law.

  12. No Surrender of Others' Freedom.

  If conditions are imposed on you (whether by court order, agreement or
otherwise) that contradict the conditions of this License, they do not
excuse you from the conditions of this License.  If you cannot convey a
covered work so as to satisfy simultaneously your obligations under this
License and any other pertinent obligations, then as a consequence you may
not convey it at all.  For example, if you agree to terms that obligate you
to collect a royalty for further conveying from those to whom you convey
the Program, the only way you could satisfy both those terms and this
License would be to refrain entirely from conveying the Program.

  13. Use with the GNU Affero General Public License.

  Notwithstanding any other provision of this License, you have
permission to link or combine any covered work with a work licensed
under version 3 of the GNU Affero General Public License into a single
combined work, and to convey the resulting work.  The terms of this
License will continue to apply to the part which is the covered work,
but the special requirements of the GNU Affero General Public License,
section 13, concerning interaction through a network will apply to the
combination as such.

  14. Revised Versions of this License.

  The Free Software Foundation may publish revised and/or new versions of
the GNU General Public License from time to time.  Such new versions will
be similar in spirit to the present version, but may differ in detail to
address new problems or concerns.

  Each version is given a distinguishing version number.  If the
Program specifies that a certain numbered version of the GNU General
Public License "or any later version" applies to it, you have the
option of following the terms and conditions either of that numbered
version or of any later version published by the Free Software
Foundation.  If the Program does not specify a version number of the
GNU General Public License, you may choose any version ever published
by the Free Software Foundation.

  If the Program specifies that a proxy can decide which future
versions of the GNU General Public License can be used, that proxy's
public statement of acceptance of a version permanently authorizes you
to choose that version for the Program.

  Later license versions may give you additional or different
permissions.  However, no additional obligations are imposed on any
author or copyright holder as a result of your choosing to follow a
later version.

  15. Disclaimer of Warranty.

  THERE IS NO WARRANTY FOR THE PROGRAM, TO THE EXTENT PERMITTED BY
APPLICABLE LAW.  EXCEPT WHEN OTHERWISE STATED IN WRITING THE COPYRIGHT
HOLDERS AND/OR OTHER PARTIES PROVIDE THE PROGRAM "AS IS" WITHOUT WARRANTY
OF ANY KIND, EITHER EXPRESSED OR IMPLIED, INCLUDING, BUT NOT LIMITED TO,
THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
PURPOSE.  THE ENTIRE RISK AS TO THE QUALITY AND PERFORMANCE OF THE PROGRAM
IS WITH YOU.  SHOULD THE PROGRAM PROVE DEFECTIVE, YOU ASSUME THE COST OF
ALL NECESSARY SERVICING, REPAIR OR CORRECTION.

  16. Limitation of Liability.

  IN NO EVENT UNLESS REQUIRED BY APPLICABLE LAW OR AGREED TO IN WRITING
WILL ANY COPYRIGHT HOLDER, OR ANY OTHER PARTY WHO MODIFIES AND/OR CONVEYS
THE PROGRAM AS PERMITTED ABOVE, BE LIABLE TO YOU FOR DAMAGES, INCLUDING ANY
GENERAL, SPECIAL, INCIDENTAL OR CONSEQUENTIAL DAMAGES ARISING OUT OF THE
USE OR INABILITY TO USE THE PROGRAM (INCLUDING BUT NOT LIMITED TO LOSS OF
DATA OR DATA BEING RENDERED INACCURATE OR LOSSES SUSTAINED BY YOU OR THIRD
PARTIES OR A FAILURE OF THE PROGRAM TO OPERATE WITH ANY OTHER PROGRAMS),
EVEN IF SUCH HOLDER OR OTHER PARTY HAS BEEN ADVISED OF THE POSSIBILITY OF
SUCH DAMAGES.

  17. Interpretation of Sections 15 and 16.

  If the disclaimer of warranty and limitation of liability provided
above cannot be given local legal effect according to their terms,
reviewing courts shall apply local law that most closely approximates
an absolute waiver of all civil liability in connection with the
Program, unless a warranty or assumption of liability accompanies a
copy of the Program in return for a fee.

                     END OF TERMS AND CONDITIONS

            How to Apply These Terms to Your New Programs

  If you develop a new program, and you want it to be of the greatest
possible use to the public, the best way to achieve this is to make it
free software which everyone can redistribute and change under these terms.

  To do so, attach the following notices to the program.  It is safest
to attach them to the start of each source file to most effectively
state the exclusion of warranty; and each file should have at least
the "copyright" line and a pointer to where the full notice is found.

    <one line to give the program's name and a brief idea of what it does.>
    Copyright (C) <year>  <name of author>

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.

Also add information on how to contact you by electronic and paper mail.

  If the program does terminal interaction, make it output a short
notice like this when it starts in an interactive mode:

    <program>  Copyright (C) <year>  <name of author>
    This program comes with ABSOLUTELY NO WARRANTY; for details type `show w'.
    This is free software, and you are welcome to redistribute it
    under certain conditions; type `show c' for details.

The hypothetical commands `show w' and `show c' should show the appropriate
parts of the General Public License.  Of course, your program's commands
might be different; for a GUI interface, you would use an "about box".

  You should also get your employer (if you work as a programmer) or school,
if any, to sign a "copyright disclaimer" for the program, if necessary.
For more information on this, and how to apply and follow the GNU GPL, see
<https://www.gnu.org/licenses/>.

  The GNU General Public License does not permit incorporating your program
into proprietary programs.  If your program is a subroutine library, you
may consider it more useful to permit linking proprietary applications with
the library.  If this is what you want to do, use the GNU Lesser General
Public License instead of this License.  But first, please read
<https://www.gnu.org/licenses/why-not-lgpl.html>.
*/
//#endregion