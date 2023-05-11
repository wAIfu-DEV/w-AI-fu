import * as fs from 'fs';
import * as cproc from 'child_process';
import * as http from 'http';

const fetch = require('node-fetch');

const readline = require('readline/promises');
const { resolve } = require('path');
const rl = readline.createInterface(process.stdin, process.stdout);

const hostname = '127.0.0.1';
const port = 7860;

const server = http.createServer((req, res) => {
    if (req.method === 'POST') {
        console.log('received POST request');
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Hello World');
    }
});
server.listen(port, hostname, () => {});

enum InputMode {
    Text, Voice
}

// see ./package.json
class Package {
    version: string = '';
}

// see ../config.json
class Config {
    character_name: string = '';
    user_name: string = '';
    is_voice_input: boolean = false;
    parrot_mode: boolean = false;
    read_live_chat: boolean = false;
    tts_use_playht: boolean = false;
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
    chat_reader_initialized: boolean = false;
    input_skipped: boolean = false;
    bad_words: string[] = [];
    command_queue: string[] = [];
    last_chat_msg = '';
    input_mode: InputMode = InputMode.Text;
    config: Config = new Config();
    package: Package = new Package();
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
        const is_chat = sender === 'CHAT';
        const handled = (is_chat)
            ? input
            : await handleCommand(input);

        if (handled === null || handled === '') {
            wAIfu.input_skipped = true;
            continue main_loop;
        }

        const identifier = (is_chat)
            ? `[CHAT] ${pseudo}`
            : sender;

        let additional_memories = '';
        if (is_chat) additional_memories += getChatMemories(pseudo);

        let prompt = `${identifier}: ${handled}\n${wAIfu.character.char_name}:`;
        let response = await sendToLLM(flattenMemory(additional_memories) + prompt);

        let displayed: string | null = (is_chat)
            ? ` ${pseudo} said "${handled}".${response}`
            : response;

        if (verifyText(displayed)) {
            displayed = ' Filtered.\n';
            response = ' Filtered.\n';
        }

        put(`${wAIfu.character.char_name}:${displayed}`);
        exposeCaptions(displayed);

        const new_memory = `${identifier}: ${input}\n${wAIfu.character.char_name}:${response}`;

        wAIfu.memory.short_term.push(new_memory);
        if (is_chat) addChatMemory(pseudo, new_memory);

        await sendToTTS(displayed);
        exposeCaptions('');
    }
}

function init() {
    process.title = 'w-AI-fu';

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

    wAIfu.memory.long_term = `(${wAIfu.character.char_persona})\n\n${wAIfu.character.example_dialogue}`

    if (wAIfu.config.filter_bad_words) {
        put('Loading filter ...\n');
        wAIfu.bad_words = getBadWords();
    }

    if (!isAuthCorrect()) {
        put('Failed auth validation, exiting.\n');
        closeProgram(0);
    }

    if (fs.existsSync('./devices/device.txt') === false) {
        put('Could not find default audio device, asking user ...\n')
        cproc.spawnSync('start', ['cmd /c "python audio_devices.py"'],
            { cwd: './devices', shell: true });
    } 

    put('Spawning subprocesses ...\n');
    summonProcesses(wAIfu.input_mode);

    put('Loaded w-AI-fu.\n\n');
    put('Commands: !mode [text, voice], !say [...], !script [_.txt], !chat [on, off], !history, !char, !reset, !stop, !save, !debug, !reload\n');

    init_get();
}

function flattenMemory(additional: string): string {
    let result = wAIfu.memory.long_term + additional;

    // Remove old short-term memory
    // Prevents character dillution
    // Increase the right-hand number to allow for greater memory capacity
    // at the cost of answers less faithul to the character.
    while (wAIfu.memory.short_term.length > 4) {
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
    const OAU = fs.readFileSync('../auth/(OPTIONAL) twitch_oauth.txt').toString().trim();
    const PTA = fs.readFileSync('../auth/(OPTIONAL) play-ht_auth.txt').toString().trim();
    const PTU = fs.readFileSync('../auth/(OPTIONAL) play-ht_user.txt').toString().trim();

    if (USR === '') {
        put('Validation Error: NovelAI account mail adress is missing from auth/novel_user.txt\n');
        return false;
    }

    if (PSW === '') {
        put('Validation Error: NovelAI account password is missing from auth/novel_pass.txt\n');
        return false;
    }

    if (OAU === '' && wAIfu.config.read_live_chat === true) {
        put('Validation Error: twitch oauth token is missing from auth/(OPTIONAL) twitch_oauth.txt\n');
        return false;
    }

    if (PTA === '' && wAIfu.config.tts_use_playht === true) {
        put('Validation Error: play.ht auth token is missing from auth/(OPTIONAL) play-ht_auth.txt\n');
        return false;
    }

    if (PTU === '' && wAIfu.config.tts_use_playht === true) {
        put('Validation Error: play.ht user token is missing from auth/(OPTIONAL) play-ht_user.txt\n');
        return false;
    }

    return true;
}

async function getInput(mode: InputMode) {
    if(wAIfu.input_skipped === false) {
        put('> ');
    }
    wAIfu.input_skipped = false;

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

    chatmsg.message = sanitizeText(chatmsg.message);
    //let filtered = verifyText(chatmsg.message);

    if (wAIfu.last_chat_msg === chatmsg.message) { //|| filtered === true) {
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
    if (LLM.running) return;

    const USR = fs.readFileSync('../auth/novel_user.txt').toString().trim();
    const PSW = fs.readFileSync('../auth/novel_pass.txt').toString().trim();

    LLM.process = cproc.spawn('python', ['novel_llm.py'],
        { cwd: './novel', env: { NAI_USERNAME: USR, NAI_PASSWORD: PSW } });
    LLM.running = true;
}

function startTTS() {
    if (TTS.running) return;

    const USR = fs.readFileSync('../auth/novel_user.txt').toString().trim();
    const PSW = fs.readFileSync('../auth/novel_pass.txt').toString().trim();

    const tts_provider = (wAIfu.config.tts_use_playht) ? 'playht_tts.py' : 'novel_tts.py';

    TTS.process = cproc.spawn('python', [tts_provider],
        { cwd: './novel', env: { NAI_USERNAME: USR, NAI_PASSWORD: PSW } });
    TTS.running = true;
}

function startLiveChat() {
    if (CHAT.running) return;

    CHAT.process = cproc.spawn('python', ['twitchchat.py'], { cwd: './twitch' });
    CHAT.running = true;
}

function startSTT() {
    if (STT.running) return;

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
    if (wAIfu.config.parrot_mode && command.startsWith('!', 0) === false) {
        command = '!say ' + command;
        if (wAIfu.input_mode === InputMode.Voice) put('\n');
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
            put('\x1B[1;30m' + flattenMemory('') + '\n' + '\x1B[0m');
            return null;
        }
        case '!debug': {
            // Shows additional debug informations (json data etc...)
            wAIfu.is_debug = true;
            return null;
        }
        case '!stop': {
            // Interrupt application
            closeProgram(0);
            return null;
        }
        case '!char': {
            // Similar to !history, but prints character infos from .json file
            put(`\x1B[1;30m(${wAIfu.character.char_persona})\n\n${wAIfu.character.example_dialogue}\x1B[0m\n`);
            return null;
        }
        case '!save': {
            const f = './saved/log_' + new Date().getTime().toString() + '.txt';
            put('\x1B[1;30m' + 'saved to: ' + resolve(f) + '\n' + '\x1B[0m');
            fs.writeFileSync(f, flattenMemory(''));
            return null;
        }
        case '!script': {
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
        }
        case '!reload': {
            put('Reloading files ...\n');
            wAIfu.config = getConfig();
            wAIfu.character = getCharacter();
            wAIfu.bad_words = getBadWords();
            closeSubProcesses();
            summonProcesses(wAIfu.input_mode);
            return null;
        }
        case '!mode': {
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
        } 
        case '!chat': {
            const chat_toggle = command.substring('!chat '.length, undefined).trim();
            switch (chat_toggle.toLowerCase()) {
                case 'on':
                    wAIfu.live_chat = true;
                    startLiveChat();
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
        default:
            put('Invalid command.\n');
            return null;
    }
}

function sanitizeText(text: string) {
    return text.replace(/[^a-zA-Z .,?!]/g, '');
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
    debug('Awaiting text input ...\n');
    return new Promise<string | null | undefined>(
        (resolve) => {
            let text: string | null = null;
            let resolved: boolean = false;

            if (wAIfu.live_chat && wAIfu.started) {
                setTimeout(() => {
                    if (resolved) return;
                    debug('Input timeout.\n');
                    resolved = true;
                    resolve(text);
                }, wAIfu.config.chat_read_timeout_sec * 1000);
            }

            const checkQueue = () => {
                if (resolved) return;

                if (wAIfu.command_queue.length > 0) {
                    debug(`Consuming queue element: ${wAIfu.command_queue[0]}\n`);
                    text = wAIfu.command_queue.shift()!;
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

function voiceGet() {
    return new Promise<string | null | undefined>(
        (resolve) => {
            let text: string | null = null;
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

                if (fs.existsSync('./speech/input.txt')) {
                    text = fs.readFileSync('./speech/input.txt').toString();
                    fs.unlinkSync('./speech/input.txt');
                    resolved = true;
                    resolve(text);
                } else if (wAIfu.command_queue.length > 0) {
                    debug(`Consuming queue element: ${wAIfu.command_queue[0]}\n`);
                    text = wAIfu.command_queue.shift()!;
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

function exposeCaptions(text: string) {
    fs.writeFileSync('./captions/transcript.txt', text);
}

function getChatMemories(user: string): string {

    const db = fetchChatDatabase();
    const logs = db.get(user);
    let result = '';

    if (logs === undefined) return result;

    for (let s of logs) {
        result += Buffer.from(s, 'base64').toString('utf8');
    }

    return result;
}

function addChatMemory(user: string, memory: string) {
    const db = fetchChatDatabase();
    const logs = db.get(user);

    const b64_mem = Buffer.from(memory, 'utf8').toString('base64');

    if (logs === undefined) {
        db.set(user, [b64_mem]);
        return;
    };

    while (logs.length > 3)
        logs.shift();

    logs.push(b64_mem);

    updateChatDatabase(db);
}

function fetchChatDatabase(): Map<string, string[]> {
    let fcontent = fs.readFileSync('./data/chat_user_db.csv', { encoding: 'utf8' });
    return parseChatDatabase(fcontent);
}

function updateChatDatabase(obj: Map<string, string[]>) {
    let s = flattenChatDatabase(obj);
    fs.writeFileSync('./data/chat_user_db.csv', s);
}

function parseChatDatabase(text: string): Map<string, string[]> {
    const lines: string[] = text.split(/\r\n|\n/);

    let csv_map: Map<string, string[]> = new Map();

    for (let i = 0; i < lines.length; ++i) {
        if (lines[i].trim() === '') break;
        let spl: string[] = lines[i].split(',');

        if (spl.length !== 5) {
            put(`Critical Error: Incorrect formating of chat_user_db.csv file at line ${i}. Expected line length of 5, got ${spl.length}\n`);
            closeProgram(1);
        }

        csv_map.set(spl[0], [spl[1], spl[2], spl[3], spl[4]]);
    }
    return csv_map;
}

function flattenChatDatabase(obj: Map<string, string[]>): string {
    let flat = '';

    for (let [key, value] of obj) {

        let log = Array.from(value);
        while(log.length > 4)
            log.shift();
        
        let line = key
        
        for (let s of log) {
            line += ',' + s;
        }
        flat += line + '\n';
    }

    return flat;
}