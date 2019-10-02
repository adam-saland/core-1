/*
    Intercept and modify the contents of a request at various stages of its lifetime, based on
    https://github.com/openfin/runtime/blob/develop/docs/api/web-request.md

    v1: handler for onBeforeSendHeaders
 */

import * as coreState from './core_state';
import { app, session, webContents } from 'electron';
import * as Shapes from '../shapes';

const moduleName: string = 'WebRequestHandlers';  // for logging

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
    extraInfo?: any;
}

function matchUrlPatterns(url: string, {urlPatterns}: Shapes.WebRequestHeaderConfig): boolean {
    let match: boolean = false;
    if (urlPatterns && urlPatterns.length > 0) {
        match = app.matchesURL(url, urlPatterns);
    }
    return match;
}

function applyHeaders(requestHeaders: any, {headers}: Shapes.WebRequestHeaderConfig): any {
    const rh = Object.assign({}, requestHeaders);
    if (headers && headers.length > 0) {
        headers.forEach((header) => {
            Object.keys(header).forEach(key => {
                rh[key] = header[key];
            });
        });
        return rh;
    }
}

// Have to pass in a new object to the onBeforeSendHeaders callback,
// Can not mutate the original requestHeaders RequestDetails Object
function beforeSendHeadersHandler({
    id,
    url,
    method,
    resourceType,
    requestHeaders,
    renderProcessId,
    renderFrameId,
    webContentsId
}: RequestDetails,
    callback: (response: HeadersResponse) => void): void {
    let headerAdded: boolean = false;
    let headerAttributeObj: RequestDetails['requestHeaders'];
    if (webContentsId) {
        app
            .vlog(1,
                `${moduleName}:beforeSendHeadersHandler:
            {
                id: ${id},
                url: ${url},
                method: ${method},
                resourceType: ${resourceType},
                requestHeaders: ${JSON.stringify(requestHeaders)},
                renderProcessId: ${renderProcessId},
                renderFrameId: ${renderFrameId},
                webContentsId: ${webContentsId}
            }`
            );
        const wc = webContents.fromId(webContentsId);
        app.vlog(1, `${moduleName}:beforeSendHeadersHandler got webcontents ${wc.id}`);
        const bw = wc.getOwnerBrowserWindow();
        if (bw && typeof bw.id === 'number') {
            const opts: Shapes.WindowOptions | any = coreState.getMainWindowOptions(bw.id);
            app.vlog(1, `${moduleName}:beforeSendHeadersHandler window opts ${JSON.stringify(opts)}`);
            if (opts && opts.customRequestHeaders) {
                for (const rhItem of opts.customRequestHeaders) {
                    if (matchUrlPatterns(url, rhItem)) {
                        headerAttributeObj = { ...requestHeaders, ...applyHeaders(requestHeaders, rhItem) };
                        headerAdded = true;
                    }
                }
            }
        } else {
            app.vlog(1, `${moduleName}:beforeSendHeadersHandler missing webContent`);
        }
    }

    if (headerAdded) {
        callback({ cancel: false, requestHeaders: headerAttributeObj });
    } else {
        callback({ cancel: false });
    }
}

// Initialize web request handlers
export function initHandlers(): void {
    app.vlog(1, `init ${moduleName}`);
    session.defaultSession.webRequest.onBeforeSendHeaders(beforeSendHeadersHandler);
}
