import 'monaco-editor/esm/vs/editor/editor.all.js';

// select features
import 'monaco-editor/esm/vs/editor/standalone/browser/accessibilityHelp/accessibilityHelp.js';
import 'monaco-editor/esm/vs/editor/standalone/browser/inspectTokens/inspectTokens.js';
import 'monaco-editor/esm/vs/editor/standalone/browser/iPadShowKeyboard/iPadShowKeyboard.js';
import 'monaco-editor/esm/vs/editor/standalone/browser/quickAccess/standaloneHelpQuickAccess.js';
import 'monaco-editor/esm/vs/editor/standalone/browser/quickAccess/standaloneGotoLineQuickAccess.js';
import 'monaco-editor/esm/vs/editor/standalone/browser/quickAccess/standaloneGotoSymbolQuickAccess.js';
import 'monaco-editor/esm/vs/editor/standalone/browser/quickAccess/standaloneCommandsQuickAccess.js';
import 'monaco-editor/esm/vs/editor/standalone/browser/quickInput/standaloneQuickInputService.js';
import 'monaco-editor/esm/vs/editor/standalone/browser/referenceSearch/standaloneReferenceSearch.js';

// add workers
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution';
import 'monaco-editor/esm/vs/language/html/monaco.contribution';
import 'monaco-editor/esm/vs/language/css/monaco.contribution';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';

// support all basic-languages
import 'monaco-editor/esm/vs/basic-languages/monaco.contribution';

import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

import { getMonacoCss } from './generated/css';
import { getCodiconTtf } from './generated/ttf';

import { MonacoLanguageClient, CloseAction, ErrorAction, MonacoServices, MessageTransports } from 'monaco-languageclient';
import { toSocket, WebSocketMessageReader, WebSocketMessageWriter } from 'vscode-ws-jsonrpc';
import { BrowserMessageReader, BrowserMessageWriter } from 'vscode-languageserver-protocol/browser';
import normalizeUrl from 'normalize-url';

import type { } from 'css-font-loading-module';

export type WebSocketConfigOptions = {
    wsSecured: boolean;
    wsHost: string;
    wsPort: number;
    wsPath: string;
}

export type WorkerConfigOptions = {
    workerURL: string;
    workerType: 'classic' | 'module';
    workerName?: string;
}

export class CodeEditorConfig {

    private useDiffEditor = false;
    private codeOriginal: [string, string] = ['', 'javascript'];
    private codeModified: [string, string] = ['', 'javascript'];
    private theme = 'vs-light';
    private monacoEditorOptions: Record<string, unknown> = {
        readOnly: false
    };
    private monacoDiffEditorOptions: Record<string, unknown> = {
        readOnly: false
    };

    // languageclient related configuration
    private useLanguageClient = false;
    // create config type web socket / web worker
    private useWebSocket = true;
    private lcConfigOptions = this.useWebSocket ? this.getDefaultWebSocketConfig() : this.getDefaultWorkerConfig();

    private languageDef: monaco.languages.IMonarchLanguage | undefined = undefined;
    private themeData: monaco.editor.IStandaloneThemeData | undefined = undefined;

    isUseDiffEditor(): boolean {
        return this.useDiffEditor;
    }

    setUseDiffEditor(useDiffEditor: boolean): void {
        this.useDiffEditor = useDiffEditor;
    }

    isUseLanguageClient(): boolean {
        return this.useLanguageClient;
    }

    setUseLanguageClient(useLanguageClient: boolean): void {
        this.useLanguageClient = useLanguageClient;
    }

    isUseWebSocket(): boolean {
        return this.useWebSocket;
    }

    setUseWebSocket(useWebSocket: boolean): void {
        this.useWebSocket = useWebSocket;
    }

    getTheme(): string {
        return this.theme;
    }

    setTheme(theme: string): void {
        this.theme = theme;
    }

    getMainLanguageId(): string {
        return this.codeOriginal[1];
    }

    setMainLanguageId(languageId: string): void {
        this.codeOriginal[1] = languageId;
    }

    getMainCode(): string {
        return this.codeOriginal[0];
    }

    setMainCode(code: string): void {
        this.codeOriginal[0] = code;
    }

    getDiffLanguageId(): string {
        return this.codeModified[1];
    }

    setDiffLanguageId(languageId: string): void {
        this.codeModified[1] = languageId;
    }

    getDiffCode(): string {
        return this.codeModified[0];
    }

    setDiffCode(code: string): void {
        this.codeModified[0] = code;
    }

    getMonacoEditorOptions(): monaco.editor.IEditorOptions & monaco.editor.IGlobalEditorOptions {
        return this.monacoEditorOptions;
    }

    setMonacoEditorOptions(monacoEditorOptions: Record<string, unknown>): void {
        this.monacoEditorOptions = monacoEditorOptions;
    }

    getMonacoDiffEditorOptions(): monaco.editor.IDiffEditorOptions & monaco.editor.IGlobalEditorOptions {
        return this.monacoDiffEditorOptions;
    }

    setMonacoDiffEditorOptions(monacoDiffEditorOptions: Record<string, unknown>): void {
        this.monacoDiffEditorOptions = monacoDiffEditorOptions;
    }

    getMonarchTokensProvider(): monaco.languages.IMonarchLanguage | undefined {
        return this.languageDef;
    }

    setMonarchTokensProvider(languageDef: unknown): void {
        this.languageDef = languageDef as monaco.languages.IMonarchLanguage;
    }

    setEditorThemeData(themeData: unknown): void {
        this.themeData = themeData as monaco.editor.IStandaloneThemeData;
    }

    getEditorThemeData(): monaco.editor.IStandaloneThemeData | undefined {
        return this.themeData;
    }

    getLanguageClientConfigOptions(): WebSocketConfigOptions | WorkerConfigOptions {
        return this.lcConfigOptions;
    }

    setLanguageClientConfigOptions(lcConfigOptions: WebSocketConfigOptions | WorkerConfigOptions): void {
        this.lcConfigOptions = lcConfigOptions;
    }

    getDefaultWebSocketConfig(): WebSocketConfigOptions {
        return {
            wsSecured: false,
            wsHost: 'localhost',
            wsPort: 8080,
            wsPath: ''
        };
    }

    getDefaultWorkerConfig(): WorkerConfigOptions {
        return {
            workerURL: '',
            workerType: 'classic',
            workerName: 'WrapperWorker'
        };
    }
}

export class MonacoEditorLanguageClientWrapper {

    private editor: monaco.editor.IStandaloneCodeEditor | undefined;
    private diffEditor: monaco.editor.IStandaloneDiffEditor | undefined;
    private editorConfig: CodeEditorConfig = new CodeEditorConfig();
    private languageClient: MonacoLanguageClient | undefined;
    private worker: Worker | undefined;

    private id: string;

    constructor(id: string) {
        this.id = id;
    }

    getEditorConfig() {
        return this.editorConfig;
    }

    updateTheme() {
        monaco.editor.setTheme(this.editorConfig.getTheme());
    }

    setWorker(worker: Worker) {
        this.worker = worker;
    }

    isStarted(): boolean {
        return this.editor !== undefined || this.diffEditor !== undefined;
    }

    startEditor(container?: HTMLElement, dispatchEvent?: (event: Event) => boolean) {
        console.log(`Starting monaco-editor (${this.id})`);

        if (this.editorConfig.isUseDiffEditor()) {
            this.diffEditor = monaco.editor.createDiffEditor(container!);
        }
        else {
            this.editor = monaco.editor.create(container!);
            this.editor.getModel()!.onDidChangeContent(() => {
                if (dispatchEvent) {
                    dispatchEvent(new CustomEvent('ChangeContent', { detail: {} }));
                }
            });
        }
        this.updateEditor();

        if (this.editorConfig.isUseLanguageClient()) {
            console.log('Enabling monaco-languageclient');
            this.installMonaco();
            this.startLanguageClientConnection(this.editorConfig.getLanguageClientConfigOptions());
        }
    }

    async dispose(): Promise<void> {
        this.disposeEditor();
        this.disposeDiffEditor();
        return this.disposeLanguageClient();
    }

    private disposeEditor() {
        if (this.editor) {
            const model = this.editor.getModel();
            model?.dispose();
            this.editor.dispose();
            this.editor = undefined;
        }
    }

    private disposeDiffEditor() {
        if (this.diffEditor) {
            const model = this.diffEditor.getModel();
            model?.modified.dispose();
            model?.original.dispose();
            this.diffEditor.dispose();
            this.diffEditor = undefined;
        }
    }

    private async disposeLanguageClient() {
        if (this.languageClient) {
            await this.languageClient.dispose()
                .then(() => {
                    this.worker?.terminate();
                    this.worker = undefined;
                    this.languageClient = undefined;
                });
        }
        else {
            return Promise.resolve();
        }
    }

    swapEditors(container?: HTMLElement, dispatchEvent?: (event: Event) => boolean): void {
        if (this.editorConfig.isUseDiffEditor()) {
            this.disposeEditor();
            if (!this.diffEditor) {
                this.startEditor(container, dispatchEvent);
            }
        }
        else {
            this.disposeDiffEditor();
            if (!this.editor) {
                this.startEditor(container, dispatchEvent);
            }
        }
    }

    updateEditor() {
        if (this.editorConfig.isUseDiffEditor()) {
            this.updateDiffEditor();
        }
        else {
            this.updateMainEditor();
        }
    }

    private updateMainEditor() {
        this.updateCommonEditorConfig();
        const options = this.editorConfig.getMonacoEditorOptions();
        this.editor?.updateOptions(options);

        const currentModel = this.editor?.getModel();
        const languageId = this.editorConfig.getMainLanguageId();
        if (languageId && currentModel && currentModel.getLanguageId() !== languageId) {
            monaco.editor.setModelLanguage(currentModel, languageId);
        }

        const mainCode = this.editorConfig.getMainCode();
        if (mainCode) {
            this.editor?.setValue(mainCode);
        }
        this.updateLayout();
    }

    private updateDiffEditor() {
        this.updateCommonEditorConfig();
        const options = this.editorConfig.getMonacoDiffEditorOptions();
        this.diffEditor?.updateOptions(options);
        this.updateDiffModels();
        this.updateLayout();
    }

    private updateCommonEditorConfig() {
        if (this.editorConfig.isUseLanguageClient()) {
            const languageId = this.editorConfig.getMainLanguageId();

            // apply monarch definitions
            if (languageId) {
                monaco.languages.register({ id: languageId });
            }
            const tokenProvider = this.editorConfig.getMonarchTokensProvider();
            if (tokenProvider) {
                monaco.languages.setMonarchTokensProvider(languageId, tokenProvider);
            }
            const themeData = this.editorConfig.getEditorThemeData();
            if (themeData) {
                monaco.editor.defineTheme(this.editorConfig.getTheme(), themeData);
            }
        }
        this.updateTheme();
    }

    private updateDiffModels() {
        if (this.diffEditor) {
            const originalModel = monaco.editor.createModel(this.editorConfig.getMainCode(), this.editorConfig.getMainLanguageId());
            const modifiedModel = monaco.editor.createModel(this.editorConfig.getDiffCode(), this.editorConfig.getDiffLanguageId());

            this.diffEditor.setModel({
                original: originalModel,
                modified: modifiedModel
            });
        }
    }

    updateLayout() {
        if (this.editorConfig.isUseDiffEditor()) {
            this.diffEditor?.layout();
        }
        else {
            this.editor?.layout();
        }
    }

    private installMonaco() {
        // install Monaco language client services
        if (monaco) {
            try {
                MonacoServices.get();
            }
            catch (e: unknown) {
                // install only if services are not yet available (exception will happen only then)
                MonacoServices.install();
                console.log(`Component (${this.id}): Installed MonacoServices`);
            }
        }
    }

    private startLanguageClientConnection(lcConfigOptions: WebSocketConfigOptions | WorkerConfigOptions) {
        if (this.languageClient && this.languageClient.isRunning()) return;

        let reader: WebSocketMessageReader | BrowserMessageReader;
        let writer: WebSocketMessageWriter | BrowserMessageWriter;
        if (this.editorConfig.isUseWebSocket()) {
            const webSocketConfigOptions = lcConfigOptions as WebSocketConfigOptions;
            const url = this.createUrl(webSocketConfigOptions);
            const webSocket = new WebSocket(url);

            webSocket.onopen = () => {
                const socket = toSocket(webSocket);
                const reader = new WebSocketMessageReader(socket);
                const writer = new WebSocketMessageWriter(socket);
                this.languageClient = this.createLanguageClient({ reader, writer });
                this.languageClient.start();
                reader.onClose(() => this.languageClient?.stop());
            };
        } else {
            const workerConfigOptions = lcConfigOptions as WorkerConfigOptions;
            if (!this.worker) {
                this.worker = new Worker(new URL(workerConfigOptions.workerURL, window.location.href).href, {
                    type: workerConfigOptions.workerType,
                    name: workerConfigOptions.workerName,
                });
            }
            reader = new BrowserMessageReader(this.worker);
            writer = new BrowserMessageWriter(this.worker);
            this.languageClient = this.createLanguageClient({ reader, writer });
            this.languageClient.start();
            reader.onClose(() => this.languageClient?.stop());
        }
    }

    private createLanguageClient(transports: MessageTransports): MonacoLanguageClient {
        return new MonacoLanguageClient({
            name: 'Monaco Wrapper Language Client',
            clientOptions: {
                // use a language id as a document selector
                documentSelector: [this.editorConfig.getMainLanguageId()],
                // disable the default error handler
                errorHandler: {
                    error: () => ({ action: ErrorAction.Continue }),
                    closed: () => ({ action: CloseAction.DoNotRestart })
                }
            },
            // create a language client connection from the JSON RPC connection on demand
            connectionProvider: {
                get: () => {
                    return Promise.resolve(transports);
                }
            }
        });
    }

    private createUrl(config: WebSocketConfigOptions) {
        const protocol = config.wsSecured ? 'wss' : 'ws';
        return normalizeUrl(`${protocol}://${config.wsHost}:${config.wsPort}/${config.wsPath}`);
    }

    static addMonacoStyles(idOfStyleElement: string) {
        const style = document.createElement('style');
        style.id = idOfStyleElement;
        style.innerHTML = getMonacoCss();
        document.head.appendChild(style);
    }

    static addCodiconTtf(): void {
        const ttf = getCodiconTtf();
        const codicon = new FontFace('Codicon', `url(${ttf})`);
        codicon.load().then(l => {
            document.fonts.add(l);
            document.body.style.fontFamily = '"Codicon", Arial';
            console.log('Loaded Codicon TTF font');
        }).catch(e => {
            throw e;
        });
    }

}
