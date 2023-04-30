import * as fs from 'fs';
import * as cproc from 'child_process';

const readline = require('readline/promises');
const { resolve } = require('path');
const rl = readline.createInterface(process.stdin, process.stdout);

enum InputMode {
    Text, Voice
}

// see ../config.json
class Config {
    character_name: string = '';
    user_name: string = '';
    is_voice_input: boolean = false;
    read_live_chat: boolean = false;
    twitch_channel_name: string = '';
    chat_read_timeout_sec: number = 2;
    filter_bad_words: boolean = true;
}

// see ./characters/*.json
class Character {
    char_name: string = '';
    voice: string = '';
    char_persona: string = '';
    example_dialogue: string = '';
}

class Memory {
    long_term: string = '';
    short_term: string[] = [];
}

class wAIfuApp {
    started: boolean = false;
    is_debug: boolean = false;
    live_chat: boolean = false;
    bad_words: string[] = [];
    command_queue: string[] = [];
    last_chat_msg = '';
    input_mode: InputMode = InputMode.Text;
    config: Config = new Config();
    character: Character = new Character();
    memory: Memory = new Memory();
}
const wAIfu = new wAIfuApp();

// Python subprocesses class
// Communication is done via requests to localhost servers
class SubProc {
    process: cproc.ChildProcess | null = null;
    api_url: string = '';
    running: boolean = false;
}

const LLM: SubProc = {
    process: null,
    api_url: 'http://127.0.0.1:7840',
    running: false
};

const TTS: SubProc = {
    process: null,
    api_url: 'http://127.0.0.1:7850',
    running: false
};

const CHAT: SubProc = {
    process: null,
    api_url: 'http://127.0.0.1:7830',
    running: false
}

const STT: SubProc = {
    process: null,
    api_url: '',
    running: false
}

main();
async function main() {
    init();

    main_loop: while (true) {
        const { input, sender, pseudo } = await getInput(wAIfu.input_mode);
        const handled = (sender === 'CHAT')
            ? input
            : await handleCommand(input);

        if (handled === null) continue main_loop;

        let prompt = `${sender}: ${handled}\n${wAIfu.character.char_name}:`;
        let response = await sendToLLM(flattenMemory() + prompt);

        let displayed: string | null = (sender === 'CHAT')
            ? `${pseudo} said: ${handled}.${response}`
            : response;

        if (verifyText(displayed)) {
            displayed = ' Filtered.\n';
            response = ' Filtered.\n';
        }

        put(`${wAIfu.character.char_name}:${displayed}`);

        wAIfu.memory.short_term.push(
            `${sender}: ${input}\n${wAIfu.character.char_name}:${response}`);
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

    wAIfu.memory.long_term = `(${wAIfu.character.char_persona})\n\n${wAIfu.character.example_dialogue}`

    if (wAIfu.config.filter_bad_words) {
        put('Loading filter ...\n');
        wAIfu.bad_words = getBadWords();
    }

    if (!isAuthCorrect()) {
        put('Failed auth validation, exiting.\n');
        closeProgram(0);
    }

    put('Spawning subprocesses ...\n');
    summonProcesses(wAIfu.input_mode);

    put('Loaded w-AI-fu.\n\n');
    put('Commands: !mode [text, voice], !say [...], !script [_.txt], !history, '
        + '!char, !reset, !stop, !save, !debug, !reload\n');

    init_get();
}

function flattenMemory(): string {
    let result = wAIfu.memory.long_term;

    // Remove old short-term memory
    // Prevents character dillution
    // Increase the right-hand number to allow for greater memory capacity
    // at the cost of a less faithul character
    while (wAIfu.memory.short_term.length > 10) {
        wAIfu.memory.short_term.shift();
    }

    for (let m of wAIfu.memory.short_term) {
        result += m;
    }
    return result;
}

function isAuthCorrect(): boolean {
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

async function getInput(mode: InputMode) {
    put('> ');

    let result: string | null | undefined = undefined;
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
    wAIfu.started = true; // Prevents input timeout on first input

    // Needed for some obscure reason
    // Because I can't seem to figure out how to initialize the damn
    //   thing from the pyhton script.
    // Initializes the Twitch Chat API script
    if (!CHAT.running && wAIfu.live_chat) {
        fetch(CHAT.api_url + '/run', {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ data: [wAIfu.config.twitch_channel_name] })
        });
        CHAT.running = true;
    }

    // If is timeout, read twitch chat
    if (result === null && wAIfu.live_chat) {
        const { message, name } = await getChatOrNothing();
        result = message;
        pseudo = name;
        sender = 'CHAT';
    }
    // user input is still undefined, not supposed to happen
    if (result === undefined || result === null) {
        put('Critical error: input is invalid.');
        closeProgram(1); process.exit(1);
    }
    return { input: result, sender, pseudo };
}

async function getChatOrNothing() {
    // If can't read chat messages
    if (wAIfu.live_chat === false) {
        return { message: '', name: '' };
    }
    // Get latest twitch chat message
    let chatmsg = await getLastTwitchChat();
    chatmsg.message = verifyText(sanitizeText(chatmsg.message));

    if (wAIfu.last_chat_msg === chatmsg.message || chatmsg.message === null) {
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
    return tostr.split(/\r\n|\n/g).map((v) => { return v.toLowerCase() });
}

function getCharacter() {
    const buff = fs.readFileSync(`./characters/${wAIfu.config.character_name}.json`);
    return JSON.parse(buff.toString());
}

function summonProcesses(mode: InputMode) {
    if (!LLM.running) startLLM();
    if (!TTS.running) startTTS();

    switch (mode) {
        case InputMode.Text:
            if (STT.running) {
                STT.process?.kill();
                STT.running = false;
            }
            break;
        case InputMode.Voice:
            if (!STT.running) startSTT();
            break;
    }
    if (wAIfu.live_chat) {
        if (!CHAT.running) startLiveChat();
    }
}

function startLLM() {
    const USR = fs.readFileSync('../auth/novel_user.txt').toString().trim();
    const PSW = fs.readFileSync('../auth/novel_pass.txt').toString().trim();

    LLM.process = cproc.spawn('python', ['novel_llm.py'],
        { cwd: './novel', env: { NAI_USERNAME: USR, NAI_PASSWORD: PSW } });
    LLM.running = true;
}

function startTTS() {
    const USR = fs.readFileSync('../auth/novel_user.txt').toString().trim();
    const PSW = fs.readFileSync('../auth/novel_pass.txt').toString().trim();

    TTS.process = cproc.spawn('python', ['novel_tts.py'],
        { cwd: './novel', env: { NAI_USERNAME: USR, NAI_PASSWORD: PSW } });
    TTS.running = true;
}

function startLiveChat() {
    CHAT.process = cproc.spawn('python', ['twitchchat.py'], { cwd: './twitch' });
    CHAT.running = true;
}

function startSTT() {
    STT.process = cproc.spawn('python', ['speech.py'], { cwd: './speech' });
    STT.running = true;
}

// Send dialog history + prompt to LLM
async function sendToLLM(prompt: string) {
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

    debug('received: ' + JSON.stringify(
        { "data": raw.toString('utf-8') }) + '\n');

    let response = raw.toString('utf-8').replace(/\n.*/, '');

    if (response.slice(-1) !== '\n')
        response = response + '\n';
    return response;
}

async function handleCommand(command: string): Promise<string | null> {
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
            // Removes short-term memory
            // Basically resets the character to initial state.
            wAIfu.memory.short_term = [];
            return null;
        case '!history':
            put('\x1B[1;30m' + flattenMemory() + '\n' + '\x1B[0m');
            return null;
        case '!debug':
            // Shows additional debug informations (json data etc...)
            wAIfu.is_debug = true;
            return null;
        case '!stop':
            // Interrupt application
            closeProgram(0);
            return null;
        case '!char':
            // Similar to !history, but prints character infos from .json file
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
        default:
            put('Invalid command.\n');
            return null;
    }
}

function sanitizeText(text: string) {
    return text.replace(/[^a-zA-Z .,]/g, '');
}

function verifyText(text: string) {
    const low_text = text.toLowerCase();
    for (const bw of wAIfu.bad_words) {
        if (low_text.includes(bw)) {
            put('FILTER MATCHED: "' + bw + '" in "' + text + '"\n');
            return true;
        }
    }
    return false;
}

// Sends LLM output to the TTS generator.
async function sendToTTS(say: string) {
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
    const e = (input: string) => {
        wAIfu.command_queue.push(input);
        debug('Added: ' + input + ' to queue.\n')
    };
    rl.on('line', e);
}

// Async input.
function textGet() {
    return new Promise<string | null | undefined>(
        (resolve) => {
            if (wAIfu.live_chat && wAIfu.started)
                setTimeout(() => {
                    resolve(null);
                }, wAIfu.config.chat_read_timeout_sec * 1000);

            const checkQueue = () => {
                if (wAIfu.command_queue.length > 0) {
                    const text = wAIfu.command_queue.shift();
                    resolve(text);
                } else {
                    setTimeout(checkQueue, 250);
                }
            };
            checkQueue();
        }
    );
}

function voiceGet() {
    return new Promise<string | null | undefined>(
        (resolve) => {
            if (wAIfu.live_chat && wAIfu.started)
                setTimeout(() => {
                    resolve(null);
                }, wAIfu.config.chat_read_timeout_sec * 1000);

            // My god what have I done
            const checkFile = () => {
                if (fs.existsSync('./speech/input.txt')) {
                    const text = fs.readFileSync('./speech/input.txt');
                    fs.unlinkSync('./speech/input.txt');
                    resolve(text.toString());
                } else if (wAIfu.command_queue.length > 0) {
                    const text = wAIfu.command_queue.shift();
                    resolve(text);
                } else {
                    setTimeout(checkFile, 250);
                }
            };
            checkFile();
        }
    );
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

function closeProgram(code: number) {
    closeSubProcesses();
    put('Exiting w.AI.fu\n');
    process.exit(code);
}

function put(text: string) {
    process.stdout.write(text);
}

function debug(text: string) {
    if (wAIfu.is_debug)
        process.stdout.write('\x1B[1;30m' + text + '\x1B[0m');
}