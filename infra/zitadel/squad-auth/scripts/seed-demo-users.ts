import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

const ZITADEL_URL = 'http://localhost:8080';
const PAT = 'mWIS6mHRjQw1kO9CTfbce8zawWYrv6r0QUOtIyfxGk0V7gJGIoOkx5S2VBX7FXPrUUoZGNY';
const ROOT_ORG_ID = '376412836206804995'; // The primary ZITADEL org

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
        const err = await res.json();
        if (err.message && err.message.includes('AlreadyExists')) {
            return { alreadyExists: true };
        }
        throw new Error(`API Error ${method} ${endpoint}: ${res.status} ${JSON.stringify(err)}`);
    }
    return res.json();
}

async function createUser(username: string, firstName: string, lastName: string, email: string, orgCode: string, facets: string, projectRoles: string[], projectId: string) {
    console.log(`\nCreating User: ${username} (${email}) ...`);
    let userId = '';
    
    try {
        const createRes = await apiCall('/management/v1/users/human', 'POST', {
            userName: username,
            profile: {
                firstName: firstName,
                lastName: lastName,
                displayName: `${firstName} ${lastName}`
            },
            email: {
                email: email,
                isEmailVerified: true
            },
            password: {
                password: 'Password123!',
                changeRequired: false
            }
        });
        userId = createRes.userId;
        console.log(`✅ Created User ID: ${userId}`);
    } catch (e: any) {
        if (e.message.includes('AlreadyExists') || e.message.includes('already exists')) {
            console.log(`ℹ️ User ${username} already exists. Attempting to find ID...`);
            const searchRes = await apiCall('/management/v1/users/_search', 'POST', {
                queries: [
                    { userNameQuery: { userName: username, method: 'TEXT_QUERY_METHOD_EQUALS' } }
                ]
            });
            if (searchRes.result && searchRes.result.length > 0) {
                userId = searchRes.result[0].id;
            } else {
                throw new Error("Could not find user after AlreadyExists error.");
            }
        } else {
            throw e;
        }
    }

    // Set User Metadata
    console.log(`Setting Metadata for ${username}...`);
    const encodedOrgCode = Buffer.from(orgCode).toString('base64');
    const encodedFacets = Buffer.from(facets).toString('base64');
    
    await apiCall(`/management/v1/users/${userId}/metadata/squadauth:logical_code`, 'POST', { value: encodedOrgCode });
    await apiCall(`/management/v1/users/${userId}/metadata/squadauth:facets`, 'POST', { value: encodedFacets });

    // Grant Roles
    try {
        await apiCall(`/management/v1/users/${userId}/grants`, 'POST', {
            projectId: projectId,
            roleKeys: projectRoles
        });
        console.log(`✅ Granted roles: ${projectRoles.join(', ')}`);
    } catch(e: any) {
        if (e.message.includes('AlreadyExists') || e.message.includes('already exists')) {
            console.log(`ℹ️ Grant already exists. (Skipping update for demo script)`);
        } else {
            console.error(`❌ Failed to grant roles: ${e.message}`);
        }
    }
}

async function setupAction() {
    console.log(`\n--- Setting up Custom Claims Action ---`);
    const seedDir = path.join(__dirname, '../seed');
    const actionsData = yaml.parse(fs.readFileSync(path.join(seedDir, '08-actions-custom-claims.yaml'), 'utf8'));
    const actionDef = actionsData.actions[0];
    
    let actionId = '';
    
    // Check if action exists
    const existingActions = await apiCall('/management/v1/actions/_search', 'POST', {});
    const existing = existingActions.result?.find((a: any) => a.name === actionDef.name);
    
    if (existing) {
        console.log(`ℹ️ Action exists. Updating...`);
        actionId = existing.id;
        await apiCall(`/management/v1/actions/${actionId}`, 'PUT', {
            name: actionDef.name,
            script: actionDef.script,
            timeout: '10s',
            allowedToFail: false
        });
    } else {
        console.log(`✅ Creating Action...`);
        const res = await apiCall('/management/v1/actions', 'POST', {
            name: actionDef.name,
            script: actionDef.script,
            timeout: '10s',
            allowedToFail: false
        });
        actionId = res.id;
    }

    // Setup Flow
    console.log(`Configuring Flow: Trigger ${actionDef.trigger}`);
    try {
        await apiCall(`/management/v1/flows/2`, 'POST', {}); // 2 is FLOW_TYPE_CUSTOMISE_TOKEN in older Zitadel versions
    } catch(e){} // Ignore if it doesn't exist
    // In Zitadel v2 API it is easier, but using management v1 flows endpoint:
    // Flow Types: FLOW_TYPE_CUSTOMISE_TOKEN (enum value usually 2)
    // Trigger Types: TRIGGER_TYPE_PRE_ACCESS_TOKEN_CREATION (enum usually 2)
    try {
       await apiCall(`/management/v1/flows/2/triggers/2/actions`, 'POST', {
           actionIds: [actionId]
       });
       console.log(`✅ Action bound to Pre Access Token Creation Trigger.`);
    } catch(e: any) {
        console.error("Could not bind action flow automatically (might already be bound).", e.message);
    }
}

async function run() {
    // 1. Get Project ID
    const projects = await apiCall('/management/v1/projects/_search', 'POST', {});
    const squadosProject = projects.result?.find((p: any) => p.name === 'squadOS');
    if (!squadosProject) throw new Error("squadOS project not found! Did you run apply-seed.ts?");
    const projectId = squadosProject.id;

    await setupAction();

    // 2. Create Users
    await createUser(
        "admin", "Squad", "Admin", "admin@squadit.eu",
        "org-NL-A001", "squadit-platform,auth-governance-owner",
        ["squados.operator.support", "squados.operator.provisioning"],
        projectId
    );

    await createUser(
        "jane", "Jane", "KPN", "jane.kpn@example.com",
        "org-NL-A101", "msp,technician_pool",
        ["squados.msp.manager", "squados.workblock.assign"],
        projectId
    );

    await createUser(
        "mark", "Mark", "Allinq", "mark.allinq@example.com",
        "org-NL-A102", "service_provider,requester,technician_pool",
        ["squados.technician.l2", "squados.workblock.execute", "squados.evidence.submit"],
        projectId
    );

    console.log("\n=========================================================");
    console.log("TEST USERS READY.");
    console.log("All passwords are set to: Password123!");
    console.log("=========================================================");
}

run().catch(console.error);
