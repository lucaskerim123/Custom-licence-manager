'use client';
import {useActionState,useEffect,useState} from 'react';
import {updateLicenseAction} from './actions';

const initial={ok:false,error:''};

export default function LicenseEditor({license}:{license:any}){
 const[state,action,pending]=useActionState(updateLicenseAction,initial);
 const[open,setOpen]=useState(false);
 useEffect(()=>{if(state.ok)setOpen(false)},[state.ok]);
 const policy=license?.metadata?.license_policy||{};
 const components=policy?.components||{};
 const expires=license.expires_at?new Date(license.expires_at).toISOString().slice(0,16):'';
 return <>
  <button type="button" className="button secondary license-action-button" onClick={()=>setOpen(v=>!v)}>{open?'Close edit':'Edit'}</button>
  {open&&<form className="license-inline-editor" action={action}>
   <input type="hidden" name="id" value={license.id}/>
   <label>Billing customer ID<input className="input" name="customer_external_id" defaultValue={license.customer_external_id||''} placeholder="OrbitFS-CUSTOMER-0001"/></label>
   <label>External reference<input className="input" name="external_reference" defaultValue={license.external_reference||''} placeholder="Order / subscription / transfer reference"/></label>
   <label>Expiry<input className="input" name="expires_at" type="datetime-local" defaultValue={expires}/></label>
   <label>Max installations<input className="input" name="max_installations" type="number" min="1" max="100" defaultValue={Number(policy.max_installations||1)}/></label>
   {license.product_code==='orbitfs_base'&&<fieldset className="component-editor"><legend>Component entitlements</legend>
    <label><input type="checkbox" checked readOnly/> OrbitFS Base</label>
    <label><input type="checkbox" name="orbitfs_apex" defaultChecked={Boolean(components.orbitfs_apex)}/> OrbitFS APEX</label>
    <label><input type="checkbox" name="orbitfs_mcp" defaultChecked={Boolean(components.orbitfs_mcp)}/> OrbitFS MCP</label>
    <label><input type="checkbox" name="orbitfs_studio" defaultChecked={Boolean(components.orbitfs_studio)}/> OrbitFS Studio</label>
   </fieldset>}
   <div className="notice"><b>Transfer behaviour</b><span>Changing the Billing customer ID transfers authority ownership. Billing Store will reconcile the new customer number on its fulfilment/linking screen.</span></div>
   {state.error&&<div className="notice dangerBox">{state.error}</div>}
   <button className="button" disabled={pending}>{pending?'Saving…':'Save licence'}</button>
  </form>}
 </>;
}