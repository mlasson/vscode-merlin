/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as fs from "fs";
import * as path from "path";
import {promisify} from "util";
import { workspace, ExtensionContext, TextEditorLineNumbersStyle } from "vscode";
import { commands, OutputChannel } from 'vscode';
import * as WebSocket from 'ws';

let exists = promisify(fs.exists);

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from "vscode-languageclient";

let client: LanguageClient;

async function isEsyProject() {
  let root = workspace.rootPath;
  if (await exists(path.join(root, 'package.json'))) {
    return true;
  } else if (await exists(path.join(root, 'esy.json'))) {
    return true;
  } else {
    return false;
  }
}

async function getCommandForWorkspace() {
  if (await isEsyProject()) {
    let command = process.platform === "win32" ? "esy.cmd" : "esy";
    let args = ["exec-command", "--include-current-env", "ocamlmerlin-lsp"];
    return {command, args};
  } else {
    let command = process.platform === "win32" ? "ocamlmerlin-lsp.exe" : "ocamlmerlin-lsp";
    let args = [];
    return {command, args};
  }
}

export async function activate(context: ExtensionContext) {
  let {command, args} = await getCommandForWorkspace();

  const socketPort = workspace.getConfiguration('languageServerExample').get('port', 7000);
  let socket: WebSocket | null = null;

  commands.registerCommand('languageServerExample.startStreaming', () => {
    socket = new WebSocket(`ws://localhost:${socketPort}`);
  });

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  let serverOptions: ServerOptions = {
    run: {
      command,
      args,
      options: {
        env: {
          ...process.env,
          MERLIN_LSP_LOG: "-"
        }
      }
    },

    debug: {
      command,
      args,
      options: {
        env: {
          ...process.env,
          MERLIN_LSP_LOG: "-"
        }
      }
    }
  };

  let log = '';

  function send (value : string) {
    log += value;
    const lines = log.split("\r\n");
    const last = lines[lines.length - 1];
    if (socket && socket.readyState === WebSocket.OPEN) {
      for (let line of lines.slice(0, lines.length - 1)) {
        socket.send(" ".repeat(21) + line + "\r\n");
      }
    }
    log = last;
  }

  const websocketOutputChannel: OutputChannel = {
    name: 'websocket',
    // Only append the logs but send them later
    append(value: string) {
      send(value);
    },
    appendLine(value: string) {
      send(value);
    },
    clear() {},
    show() {},
    hide() {},
    dispose() {}
  };

  // Options to control the language client
  let clientOptions: LanguageClientOptions = {
    // Register the server for plain text documents
    documentSelector: [
      { scheme: "file", language: "ocaml" },
      { scheme: "file", language: "reason" }
    ],
    synchronize: {
      // Notify the server about file changes to '.clientrc files contained in the workspace
      fileEvents: workspace.createFileSystemWatcher("**/.clientrc")
    },
    outputChannel: websocketOutputChannel
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    "languageServerExample",
    "Merlin Language Server",
    serverOptions,
    clientOptions
  );

  // Start the client. This will also launch the server
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
