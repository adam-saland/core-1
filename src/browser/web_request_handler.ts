
/*
    Intercept and modify the contents of a request at various stages of its lifetime, based on
    https://github.com/openfin/runtime/blob/develop/docs/api/web-request.md

    v1: handler for onBeforeSendHeaders
 */

const coreState = require('./core_state');
const electronApp = require('electron').app;
const { session, webContents } = require('electron');
import * as Shapes from '../shapes';

const moduleName: string = 'WebRequestHandlers';  // for logging

// passed to webRequest.onBeforeSendHeaders
interface RequestDetails {
    id: number;
    url: string;
    method: string;
    resourceType: string;
    requestHeaders: any;
    renderProcessId?: number; // not set if the request is not associated with a window
    renderFrameId?: number;
    webContentsId?: number;
}

// passed to callback of webRequest.onBeforeSendHeaders
interface HeadersResponse {
    cancel: boolean;
    requestHeaders?: any;
}

function matchUrlPatterns(url: string, config: Shapes.WebRequestHeaderConfig): boolean {
    let match: boolean = false;
    if (config.urlPatterns && config.urlPatterns.length > 0) {
        match = electronApp.matchesURL(url, config.urlPatterns);
    }
    return match;
}

function applyHeaders(requestHeaders: any, config: Shapes.WebRequestHeaderConfig): any {
    const rh = Object.assign({}, requestHeaders);
    if (config.headers && config.headers.length > 0) {
        config.headers.forEach((header) => {
            Object.keys(header).forEach(key => {
                rh[key] = header[key];
            });
        });
        return rh;
    }
}

// Have to pass in a new object to the onBeforeSendHeaders callback,
// can not mutate the original requestHeaders Object
// Still not hitting the applyHeaders function @ line
function beforeSendHeadersHandler(details: RequestDetails, callback: (response: HeadersResponse) => void): void {
    let headerAdded: boolean = false;
    let headerAttributeObj: RequestDetails['requestHeaders'];
    if (details.webContentsId/* details.renderProcessId && details.renderFrameId */) {
        // tslint:disable-next-line: max-line-length
        electronApp.vlog(1, `${moduleName}:beforeSendHeadersHandler: {\n\tid: ${details.id}\n\turl: ${details.url}\n\tmethod: ${details.method}\n\tresourceType: ${details.resourceType}\n\trequestHeaders: ${JSON.stringify(details.requestHeaders)}\n\trenderProcessId: ${details.renderProcessId}\n\trenderFrameId: ${details.renderFrameId}\n\twebContentsId: ${details.webContentsId}\n}`);
        const wc = webContents.fromId(details.webContentsId /* fromProcessAndFrameIds(details.renderProcessId, details.renderFrameId); */);
        if (wc) {
            electronApp.vlog(1, `${moduleName}:beforeSendHeadersHandler got webcontents ${wc.id}`);
            const bw = wc.getOwnerBrowserWindow();
            if (bw && typeof bw.id === 'number') {
                const opts: Shapes.WindowOptions = coreState.getWindowOptionsById(bw.id);
                electronApp.vlog(1, `${moduleName}:beforeSendHeadersHandler window opts ${JSON.stringify(opts)}`);
                if (opts && opts.customRequestHeaders) {
                    for (const rhItem of opts.customRequestHeaders) {
                        if (matchUrlPatterns(details.url, rhItem)) {
                            headerAttributeObj = applyHeaders(details.requestHeaders, rhItem);
                            headerAdded = true;
                        }
                    }
                }
            } // bw can be undefined during close of the window
        } else {
            electronApp.vlog(1, `${moduleName}:beforeSendHeadersHandler missing webContent`);
        }
    }

    if (headerAdded) {
        callback({ cancel: false, requestHeaders: headerAttributeObj });
    } else {
        callback({ cancel: false });
    }
}

/**
 * Initialize web request handlers
 */
export function initHandlers(): void {
    electronApp.vlog(1, `init ${moduleName}`);

    session.defaultSession.webRequest.onBeforeSendHeaders(beforeSendHeadersHandler);
}
