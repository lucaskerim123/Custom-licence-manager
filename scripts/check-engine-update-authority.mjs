import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const updater=read("app/api/v1/updater/route.ts");
const bootstrap=read("app/api/v1/engine-bootstrap/route.ts");
const deployer=read("app/api/v1/deployer/route.ts");

assert(updater.includes("const rollback=url.searchParams.get('rollback')==='1'"),"Updater must distinguish normal delivery from rollback.");
assert(updater.includes("UPDATE_ROLLBACK_TARGET_NOT_INSTALLED"),"Historical Update artifacts must require prior installation.");
assert(updater.includes("release.status!=='published'||release.review_status!=='approved'"),"Normal Update delivery must require published+approved authority.");
assert(updater.includes("channel!=='stable'&&!rollback"),"Rollback must not depend on current rollout channel access.");
assert(bootstrap.includes("engine.source.authorized"),"Historical bootstrap commits must be tied to prior authorization.");
assert(bootstrap.includes("Pinned Engine commit was never authorized for this installation"),"Arbitrary private repository commits must not be customer-selectable.");
assert(deployer.includes("const publishedApproved=release.status==='published'&&release.review_status==='approved'"),"Deployment authorization must enforce published releases for normal updates.");
assert(deployer.includes("if(updateRollback)"),"Deployment authority must have an explicit Update rollback path.");
console.log("License Manager Engine update authority checks passed.");
