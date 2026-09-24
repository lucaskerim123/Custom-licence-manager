'use client';
import {useFormStatus} from 'react-dom';

export type AuthorityControlRow={
  field:string;
  label:string;
  help:string;
  enabled:boolean;
  onText:string;
  offText:string;
  dangerWhen?:boolean;
};

function ActionButton({enabled}:{enabled:boolean}){
  const {pending}=useFormStatus();
  return <button className={enabled?'control-action danger':'control-action'} disabled={pending}>
    {pending?'Applying…':enabled?'Turn off':'Turn on'}
  </button>;
}

export default function AuthorityControlGrid({rows,canManage,action}:{rows:AuthorityControlRow[];canManage:boolean;action:(formData:FormData)=>Promise<void>}){
  return <div className="authority-grid">
    {rows.map((row,index)=>{
      const warning=Boolean(row.dangerWhen&&row.enabled);
      return <article className="authority-card" key={row.field}>
        <div className="authority-card-top">
          <div className={'authority-icon authority-icon-'+((index%5)+1)}>{['⚡','◇','◷','▣','⇄'][index%5]}</div>
          <div className="authority-state">
            <span className={warning?'status-light warning':row.enabled?'status-light online':'status-light offline'}/>
            <span>{warning?'Maintenance':row.enabled?'Live':'Offline'}</span>
          </div>
        </div>
        <div className="authority-copy">
          <h3>{row.label}</h3>
          <p>{row.help}</p>
        </div>
        <div className="authority-card-footer">
          <span className={warning?'state-pill warning':row.enabled?'state-pill online':'state-pill offline'}>
            {row.enabled?row.onText:row.offText}
          </span>
          {canManage&&<form action={action}>
            <input type="hidden" name="field" value={row.field}/>
            <input type="hidden" name="value" value={row.enabled?'false':'true'}/>
            <ActionButton enabled={row.enabled}/>
          </form>}
        </div>
      </article>;
    })}
  </div>;
}
