import { NextResponse } from 'next/server';
import { hasPveCredentials } from '@/lib/pve';
export const dynamic = "force-dynamic";
// Capability declarations, not reachability assertions. Never expose config values.
export async function GET() {
 return NextResponse.json({status:'ok',updatedAt:new Date().toISOString(),maxAgeMs:600000,data:{
  proxmox:hasPveCredentials(), authentication:process.env.APP_AUTH_MODE === 'trusted-network' ? 'Trusted-network test mode' : process.env.APP_AUTH_MODE === 'off' ? 'Authentication disabled' : 'Cloudflare Access',
  claude:'Available to test on request', piper:'Available to test on request', microphone:'Requires a secure context and browser speech recognition'
 }});
}
