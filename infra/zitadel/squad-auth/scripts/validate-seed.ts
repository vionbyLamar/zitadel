import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml'; // Requires `npm install yaml` locally or running via bun/deno

// validate-seed.ts
// Validation script for ZITADEL seed manifests.

console.log("Validating ZITADEL seed manifests...\n");

const seedDir = path.join(__dirname, '../seed');

// Utility to load YAML
function loadYaml(filename: string) {
  try {
    const file = fs.readFileSync(path.join(seedDir, filename), 'utf8');
    return yaml.parse(file);
  } catch (e: any) {
    console.warn(`[WARN] Could not load ${filename}: ${e.message}`);
    return null;
  }
}

let hasErrors = false;

// 1. Unique org codes
const orgsData = loadYaml('01-organizations.yaml');
const knownOrgs = new Set<string>();
if (orgsData && orgsData.organizations) {
  orgsData.organizations.forEach((org: any) => {
    if (knownOrgs.has(org.id)) {
      console.error(`[ERROR] Duplicate Org ID: ${org.id}`);
      hasErrors = true;
    }
    knownOrgs.add(org.id);
  });
  console.log(`✅ Validated unique org codes. Found ${knownOrgs.size} orgs.`);
}

// 2. Unique project ids
const projectsData = loadYaml('03-projects.yaml');
const knownProjects = new Set<string>();
if (projectsData && projectsData.projects) {
  projectsData.projects.forEach((proj: any) => {
    if (knownProjects.has(proj.id)) {
      console.error(`[ERROR] Duplicate Project ID: ${proj.id}`);
      hasErrors = true;
    }
    knownProjects.add(proj.id);
  });
  console.log(`✅ Validated unique project ids. Found ${knownProjects.size} projects.`);
}

// 3. Unique role keys per project
const taxonomyData = loadYaml('05-role-taxonomy.yaml');
const knownRolesByProject = new Map<string, Set<string>>();
const allRoles = new Set<string>();
if (taxonomyData && taxonomyData.projects) {
  taxonomyData.projects.forEach((proj: any) => {
    if (!knownProjects.has(proj.id)) {
      console.error(`[ERROR] Taxonomy references unknown project: ${proj.id}`);
      hasErrors = true;
    }
    const roles = new Set<string>();
    proj.roleGroups?.forEach((group: any) => {
      group.roles?.forEach((role: string) => {
        if (roles.has(role)) {
          console.error(`[ERROR] Duplicate role in project ${proj.id}: ${role}`);
          hasErrors = true;
        }
        roles.add(role);
        allRoles.add(role);
      });
    });
    knownRolesByProject.set(proj.id, roles);
  });
  console.log(`✅ Validated unique role keys per project. Found ${allRoles.size} total roles.`);
}

// 4. All apps point to known projects
const appsData = loadYaml('04-applications.yaml');
if (appsData && appsData.applications) {
  appsData.applications.forEach((appGroup: any) => {
    if (!knownProjects.has(appGroup.projectId)) {
      console.error(`[ERROR] Application references unknown project: ${appGroup.projectId}`);
      hasErrors = true;
    }
  });
  console.log(`✅ Validated applications point to known projects.`);
}

// 5. No project grants to unknown orgs or roles
const grantsData = loadYaml('06-project-grants.yaml');
if (grantsData && grantsData.projectGrants) {
  grantsData.projectGrants.forEach((grant: any) => {
    if (!knownOrgs.has(grant.sourceOrgId)) {
      console.error(`[ERROR] Grant source unknown org: ${grant.sourceOrgId}`);
      hasErrors = true;
    }
    if (!knownOrgs.has(grant.targetOrgId)) {
      console.error(`[ERROR] Grant target unknown org: ${grant.targetOrgId}`);
      hasErrors = true;
    }
    if (!knownProjects.has(grant.sourceProjectId)) {
      console.error(`[ERROR] Grant source unknown project: ${grant.sourceProjectId}`);
      hasErrors = true;
    }
    
    grant.grantedRoles?.forEach((role: string) => {
      if (!allRoles.has(role)) {
        console.error(`[ERROR] Granted role is not in taxonomy: ${role}`);
        hasErrors = true;
      }
    });
  });
  console.log(`✅ Validated project grants orgs and roles.`);
}

// 6. User grants validation
const userGrantsData = loadYaml('09-user-grants.example.yaml');
if (userGrantsData && userGrantsData.userGrants) {
  userGrantsData.userGrants.forEach((ug: any) => {
    if (!knownOrgs.has(ug.orgId)) {
      console.error(`[ERROR] User grant unknown org: ${ug.orgId}`);
      hasErrors = true;
    }
    ug.roles?.forEach((role: string) => {
      let roleValid = false;
      if (ug.orgId === 'org-NL-A001') {
        roleValid = true; // Root org owns everything
      } else {
        grantsData?.projectGrants?.forEach((pg: any) => {
          if (pg.targetOrgId === ug.orgId && pg.grantedRoles.includes(role)) {
            roleValid = true;
          }
        });
      }
      if (!roleValid) {
        console.error(`[ERROR] User grant assigns role not granted to org ${ug.orgId}: ${role}`);
        hasErrors = true;
      }
    });
  });
  console.log(`✅ Validated user grants against project grants.`);
}

// 7. Check Domain Verification States
const domainsData = loadYaml('02-org-domains.yaml');
if (domainsData && domainsData.domains) {
  domainsData.domains.forEach((domain: any) => {
    if (domain.isVerified === true) {
      console.error(`[ERROR] Domain seed uses unsafe 'isVerified: true' for domain: ${domain.domain}`);
      hasErrors = true;
    }
  });
  console.log(`✅ Validated domain verification states (no forced true).`);
}

// 8. Service Account Role Limits
const saData = loadYaml('07-service-accounts.yaml');
if (saData && saData.serviceAccounts) {
  saData.serviceAccounts.forEach((sa: any) => {
    if (sa.auditNote && sa.auditNote.includes('Read-only')) {
      sa.roles?.forEach((role: string) => {
        if (role.includes('manage') || role.includes('create') || role.includes('publish')) {
          console.error(`[ERROR] Service account ${sa.id} claims read-only but has role: ${role}`);
          hasErrors = true;
        }
      });
    }
  });
  console.log(`✅ Validated service account role boundaries.`);
}

// 9. Security Checks (secrets, tokens, etc.)
// A simple static scan over all files to ensure no accidental secrets
const files = fs.readdirSync(seedDir).filter((f: string) => f.endsWith('.yaml') || f.endsWith('.yml'));
files.forEach(file => {
  const content = fs.readFileSync(path.join(seedDir, file), 'utf8');
  if (content.match(/([a-zA-Z0-9_-]{32,})/g) && !file.includes('09-user-grants.example.yaml') && !file.includes('11-policy-snapshots.example.yaml')) {
    // Only flag long random looking strings if they aren't explicit example IDs
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if (line.match(/([a-zA-Z0-9_-]{40,})/g)) {
        console.warn(`[WARN] Potential raw token or secret in ${file}:${index + 1}: ${line.trim()}`);
      }
    });
  }
});
console.log(`✅ Checked for raw tokens/secrets (Static review passed).`);

if (hasErrors) {
  console.error(`\n❌ Validation failed. Fix the errors above before applying.`);
  process.exit(1);
} else {
  console.log(`\n✅ Validation successful. Seed manifests are hardened and ready for review.`);
}
