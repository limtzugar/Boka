import { NextRequest, NextResponse } from 'next/server';
import { getFamily } from '@/lib/family-service';
import {
  executeInSandbox, analyzeCodeSecurity,
  getExecutionHistory, classifyTaskComplexity, routeToModel,
  type SandboxRequest,
} from '@/lib/openhands-sandbox';

// POST /api/openhands?action=execute — execute code in sandbox
// POST /api/openhands?action=analyze — only security analysis (no execution)
// POST /api/openhands?action=route — model router: classify task complexity + route
// GET /api/openhands?action=history — list execution history

export async function POST(req: NextRequest) {
  try {
    const family = await getFamily();
    const action = req.nextUrl.searchParams.get('action');
    const data = await req.json();

    if (action === 'execute') {
      const sandboxReq: SandboxRequest = {
        familyId: family.id,
        appId: data.appId,
        appName: data.appName,
        inputType: data.inputType || 'function_call',
        inputPayload: data.inputPayload,
        code: data.code,
        language: data.language || 'javascript',
        timeoutMs: data.timeoutMs,
        memoryLimitMb: data.memoryLimitMb,
        sandboxKind: data.sandboxKind || 'vm',
      };
      const result = await executeInSandbox(sandboxReq);
      return NextResponse.json(result);
    }

    if (action === 'analyze') {
      const flags = analyzeCodeSecurity(data.code);
      return NextResponse.json({ securityFlags: flags, blocked: flags.some(f =>
        ['fs_access', 'child_process', 'process_exit'].includes(f)
      ) });
    }

    if (action === 'route') {
      const complexity = classifyTaskComplexity(data.input || '');
      const model = routeToModel(complexity);
      return NextResponse.json({ complexity, model });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const family = await getFamily();
    const action = req.nextUrl.searchParams.get('action');

    if (action === 'history') {
      const history = await getExecutionHistory(family.id);
      return NextResponse.json({ history });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 });
  }
}
