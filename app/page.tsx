'use client';

import { useState } from 'react';
import { parseAgreement, type Agreement } from '../src/parser/document';
import { buildPlan, type Plan } from '../src/planner/plan';
import { Dropzone } from './components/Dropzone';
import { CourseInput } from './components/CourseInput';
import { PlanView } from './components/PlanView';

export default function Home() {
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [completed, setCompleted] = useState('');
  const [error, setError] = useState('');

  // The file never leaves this function. It is read into memory with
  // arrayBuffer (the same-origin, in-tab equivalent of FileReader) and
  // handed straight to parseAgreement. There is no fetch, no API route, and
  // no server action anywhere in this app for the file to travel through.
  async function onFile(file: File) {
    try {
      setError('');
      const bytes = new Uint8Array(await file.arrayBuffer());
      setAgreement(await parseAgreement(bytes));
    } catch {
      setAgreement(null);
      setError('Could not read that PDF. Download the agreement again from assist.org and retry.');
    }
  }

  const plan: Plan | null = agreement
    ? buildPlan(
        agreement,
        completed
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
    : null;

  return (
    <main>
      <h1>Transfer Navigator</h1>
      <p className="tagline">
        Upload your ASSIST articulation agreement and see what you still need to transfer.
      </p>

      <Dropzone onFile={onFile} error={error} />

      {agreement && (
        <>
          <p className="agreement-header">
            {agreement.major}, {agreement.sendingInstitution} to {agreement.receivingInstitution},{' '}
            {agreement.academicYear}
          </p>
          <CourseInput value={completed} onChange={setCompleted} />
        </>
      )}

      {plan && <PlanView plan={plan} />}
    </main>
  );
}
