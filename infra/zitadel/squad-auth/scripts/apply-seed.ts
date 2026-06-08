import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

// apply-seed.ts
// Applies the ZITADEL seed manifests to the local running instance using REST.

const ZITADEL_URL = 'http://localhost:8080';
// Use the PAT we extracted earlier
const PAT = 'mWIS6mHRjQw1kO9CTfbce8zawWYrv6r0QUOtIyfxGk0V7gJGIoOkx5S2VBX7FXPrUUoZGNY';

// The default organization ID from the local instance
const ROOT_ORG_ID = '376412836206804995';

const seedDir = path.join(__dirname, '../seed');

function loadYaml(filename: string) {
    return yaml.parse(fs.readFileSync(path.join(seedDir, filename), 'utf8'));
}

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

async function run() {
    console.log("Applying ZITADEL Configuration Seed...");

    // 1. Setup Projects
    console.log("\n--- Projects ---");
    const projectsData = loadYaml('03-projects.yaml');
    const projectMap = new Map<string, string>(); // Logical ID -> ZITADEL Project ID
    
    // Fetch existing projects
    const existingProjects = await apiCall('/management/v1/projects/_search', 'POST', {});
    
    for (const proj of projectsData.projects) {
        let zitadelProjId = '';
        const existing = existingProjects.result?.find((p: any) => p.name === proj.name);
        
        if (existing) {
            console.log(`ℹ️ Project exists: ${proj.name}`);
            zitadelProjId = existing.id;
        } else {
            console.log(`✅ Creating project: ${proj.name}`);
            const created = await apiCall('/management/v1/projects', 'POST', {
                name: proj.name,
                projectRoleAssertion: proj.projectRoleAssertion,
                projectRoleCheck: false // Disabled for dev flexibility
            });
            zitadelProjId = created.id;
        }
        projectMap.set(proj.id, zitadelProjId);
    }

    // 2. Setup Role Taxonomy
    console.log("\n--- Roles ---");
    const taxonomyData = loadYaml('05-role-taxonomy.yaml');
    for (const proj of taxonomyData.projects) {
        const zitadelProjId = projectMap.get(proj.id);
        if (!zitadelProjId) continue;

        for (const group of proj.roleGroups || []) {
            for (const roleKey of group.roles || []) {
                try {
                    await apiCall(`/management/v1/projects/${zitadelProjId}/roles`, 'POST', {
                        roleKey: roleKey,
                        displayName: roleKey,
                        group: group.key
                    });
                    console.log(`✅ Created role: ${roleKey} (Group: ${group.key}) in ${proj.id}`);
                } catch (e: any) {
                    if (e.message.includes('AlreadyExists') || e.message.includes('already exists')) {
                        // Ignore
                    } else {
                        console.error(`❌ Failed to create role ${roleKey}: ${e.message}`);
                    }
                }
            }
        }
    }

    // 3. Setup Applications (Specifically SquadOS Web to get a Client ID)
    console.log("\n--- Applications ---");
    const appsData = loadYaml('04-applications.yaml');
    
    let squadosWebClientId = '';

    for (const appGroup of appsData.applications) {
        const zitadelProjId = projectMap.get(appGroup.projectId);
        if (!zitadelProjId) continue;
        
        const existingApps = await apiCall(`/management/v1/projects/${zitadelProjId}/apps/_search`, 'POST', {});

        for (const app of appGroup.apps) {
            const existing = existingApps.result?.find((a: any) => a.name === app.name);
            if (existing) {
                console.log(`ℹ️ Application exists: ${app.name}`);
                if (app.name === 'squados-web') {
                    squadosWebClientId = existing.oidcConfig?.clientId;
                    if (!squadosWebClientId) {
                       // Try to fetch specific app details
                       const appDetails = await apiCall(`/management/v1/projects/${zitadelProjId}/apps/${existing.id}`, 'GET');
                       squadosWebClientId = appDetails.app?.oidcConfig?.clientId;
                    }
                }
            } else {
                if (app.type === 'OIDC_APP_TYPE_USER_AGENT') {
                    console.log(`✅ Creating OIDC Web App: ${app.name}`);
                    const created = await apiCall(`/management/v1/projects/${zitadelProjId}/apps/oidc`, 'POST', {
                        name: app.name,
                        redirectUris: ['http://localhost:5002/callback'],
                        postLogoutRedirectUris: ['http://localhost:5002/'],
                        responseTypes: ['OIDC_RESPONSE_TYPE_CODE'],
                        grantTypes: ['OIDC_GRANT_TYPE_AUTHORIZATION_CODE', 'OIDC_GRANT_TYPE_REFRESH_TOKEN'],
                        appType: 'OIDC_APP_TYPE_USER_AGENT',
                        authMethodType: 'OIDC_AUTH_METHOD_TYPE_NONE',
                        devMode: true,
                        accessTokenType: 'OIDC_TOKEN_TYPE_JWT'
                    });
                    if (app.name === 'squados-web') {
                        squadosWebClientId = created.clientId;
                    }
                } else {
                    console.log(`ℹ️ Skipping non-OIDC app creation for now: ${app.name}`);
                }
            }
        }
    }

    console.log("\n===========================================");
    console.log("SEED APPLY COMPLETE.");
    console.log("===========================================");
    if (squadosWebClientId) {
        console.log(`\n🎉 squados-web Client ID: ${squadosWebClientId}`);
        console.log(`\nUpdate your .env.local in apps/platform to use this Client ID.`);
    }
}

run().catch(console.error);
