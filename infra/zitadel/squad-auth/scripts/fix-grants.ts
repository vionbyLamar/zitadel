import * as fs from 'fs';

const ZITADEL_URL = 'http://localhost:8080';
const PAT = 'mWIS6mHRjQw1kO9CTfbce8zawWYrv6r0QUOtIyfxGk0V7gJGIoOkx5S2VBX7FXPrUUoZGNY';
const ROOT_ORG_ID = '376412836206804995';

async function apiCall(endpoint: string, method: string, body?: any) {
    const res = await fetch(`${ZITADEL_URL}${endpoint}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${PAT}`,
            'x-zitadel-orgid': ROOT_ORG_ID
        },
        body: body ? JSON.stringify(body) : undefined
    });
    
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`API Error ${method} ${endpoint}: ${res.status} ${text}`);
    }
    return res.json();
}

async function run() {
    console.log("Fixing ZITADEL Project and User Grants...");

    // 1. Find squadOS project
    const projects = await apiCall('/management/v1/projects/_search', 'POST', {});
    const squados = projects.result?.find((p: any) => p.name === 'squadOS');
    if (!squados) throw new Error("squadOS project not found!");
    const projectId = squados.id;

    // 2. Disable Project Role Check (Crucial to avoid "nothing happens" on account click)
    console.log("Disabling project role check for squadOS...");
    await apiCall(`/management/v1/projects/${projectId}`, 'PUT', {
        name: 'squadOS',
        projectRoleAssertion: true,
        projectRoleCheck: false
    });
    console.log("✅ Project updated.");

    // 3. Ensure User Grants exist for demo users
    const userNames = ['admin', 'jane', 'mark'];
    for (const name of userNames) {
        console.log(`Ensuring grant for ${name}...`);
        const search = await apiCall('/management/v1/users/_search', 'POST', {
            queries: [{ userNameQuery: { userName: name, method: 'TEXT_QUERY_METHOD_EQUALS' } }]
        });
        if (search.result && search.result.length > 0) {
            const userId = search.result[0].id;
            try {
                // Fetch existing roles for this project
                const roles = await apiCall(`/management/v1/projects/${projectId}/roles/_search`, 'POST', {});
                const allRoleKeys = roles.result?.map((r: any) => r.key) || [];
                
                // Add a catch-all grant for the project to be safe
                await apiCall(`/management/v1/users/${userId}/grants`, 'POST', {
                    projectId: projectId,
                    roleKeys: allRoleKeys.slice(0, 5) // Just a few roles to satisfy the grant
                });
                console.log(`✅ Grant created for ${name}.`);
            } catch (e: any) {
                console.log(`ℹ️ Grant might already exist for ${name}.`);
            }
        }
    }
    console.log("\nFINISHED. Try logging in again!");
}

run().catch(console.error);
