import { revalidatePath } from 'next/cache';
import { requireUser } from '../../lib/session';
import { listReleases, setReleaseReview, validateRelease } from '../../lib/core/releases';
import SideNav from '../components/SideNav';
import LiveRefresh from '../components/LiveRefresh';
export const dynamic='force-dynamic';
const roles=['owner','admin','operator'];
async function validate(formData:FormData){'use server';const u=await requireUser();if(!roles.includes(u.role))return;const id=String(formData.get('id')||'');if(id)await validateRelease(id,u.id,u.email);}
async function review(formData:FormData){'use server';const u=await requireUser();if(!roles.includes(u.role))return;const id=String(formData.get('id')||''),decision=String(formData.get('decision')||'');if(id&&(decision==='approved'||decision==='rejected'))await setReleaseReview(id,decision,u.id,u.email);}

