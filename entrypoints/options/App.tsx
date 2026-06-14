// 설정(Options) UI — 09 S1, 컴포넌트 ① (M1 최소: AI 키 1개 + 모델 + 저장).
import { useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  setAiKey,
  setKeywordToolCred,
} from '@/components/settings';

export function OptionsApp() {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(DEFAULT_SETTINGS.aiModel);
  const [kwApiKey, setKwApiKey] = useState(''); // 검색광고 액세스 라이선스
  const [kwSecret, setKwSecret] = useState('');
  const [kwCustomerId, setKwCustomerId] = useState('');
  const [status, setStatus] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => {
      setModel(s.aiModel);
      if (s.aiTextCredentials[0]) setApiKey(s.aiTextCredentials[0].fields.apiKey ?? '');
      const kw = s.keywordToolCredential?.fields;
      if (kw) {
        setKwApiKey(kw.apiKey ?? '');
        setKwSecret(kw.secret ?? '');
        setKwCustomerId(kw.customerId ?? '');
      }
    });
  }, []);

  async function onSave() {
    setStatus('');
    if (!apiKey.trim()) {
      setStatus('⚠ 키를 입력해 주세요.'); // 6.4 빈 값 거부 (TC-SET-03)
      return;
    }
    setSaving(true);
    try {
      await setAiKey(apiKey, model); // 공백 트리밍 저장 (TC-SET-05)
      await setKeywordToolCred(kwApiKey, kwSecret, kwCustomerId); // ② 검색광고(선택)
      setStatus('✅ 저장했어요.');
    } catch (e) {
      setStatus(`❌ 저장 실패: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[720px] p-8 text-sm text-gray-900">
      <h1 className="mb-6 text-xl font-bold">펜플로우 설정</h1>

      <div className="mb-4 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        모든 키는 이 PC에만 저장되며 외부로 전송되지 않습니다. {/* R-0.3 */}
      </div>

      <section className="rounded border p-4">
        <h2 className="mb-3 font-semibold">AI 본문 생성 키 (필수)</h2>
        <label className="mb-1 block text-xs text-gray-500">API Key</label>
        <input
          className="mb-3 w-full rounded border px-2 py-1"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Gemini API Key"
        />
        <label className="mb-1 block text-xs text-gray-500">모델</label>
        <input
          className="mb-4 w-full rounded border px-2 py-1"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
      </section>

      <section className="mt-4 rounded border p-4">
        <h2 className="mb-1 font-semibold">네이버 검색광고 키 (선택)</h2>
        <p className="mb-3 text-xs text-gray-500">
          주제 선정 시 키워드 검색량·경쟁도 조회에 사용. 셋 다 입력해야 동작합니다. {/* ② 경로 A */}
        </p>
        <label className="mb-1 block text-xs text-gray-500">액세스 라이선스 (X-API-KEY)</label>
        <input
          className="mb-3 w-full rounded border px-2 py-1"
          type="password"
          value={kwApiKey}
          onChange={(e) => setKwApiKey(e.target.value)}
          placeholder="액세스 라이선스"
        />
        <label className="mb-1 block text-xs text-gray-500">비밀키 (Secret)</label>
        <input
          className="mb-3 w-full rounded border px-2 py-1"
          type="password"
          value={kwSecret}
          onChange={(e) => setKwSecret(e.target.value)}
          placeholder="비밀키"
        />
        <label className="mb-1 block text-xs text-gray-500">CustomerID</label>
        <input
          className="w-full rounded border px-2 py-1"
          value={kwCustomerId}
          onChange={(e) => setKwCustomerId(e.target.value)}
          placeholder="customerId"
        />
      </section>

      <div className="mt-4">
        <button
          className="rounded bg-gray-900 px-4 py-1.5 text-white disabled:opacity-50"
          onClick={onSave}
          disabled={saving}
          type="button"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
        {status && <span className="ml-3 text-xs">{status}</span>}
      </div>
    </div>
  );
}
