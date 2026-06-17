export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { q } = req.query;
  if (!q) { res.status(400).json({ error: 'q is required' }); return; }

  const NAVER_ID     = 'rBWxvoRqHS9p8UoKXb98';
  const NAVER_SECRET = 'wnohEofX0o';
  const HUNTER_KEY   = req.query.hunter || '';

  const BLOCKED = ['naver.com','kakao.com','google.com','daum.net','instagram.com',
                   'facebook.com','youtube.com','blog.','news.','cafe.','map.',
                   'shopping.','tistory.com','blogspot.','jobkorea','saramin',
                   'wanted.co.kr','linkedin.com','wikipedia'];
  const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const EMAIL_BLOCKED = ['naver','kakao','google','daum','example','w3c','sentry',
                         'email.com','test.','your@','admin@naver'];

  function cleanTag(s){ return (s||'').replace(/<[^>]*>/g,'').trim(); }

  function extractEmails(text){
    const found = (text.match(EMAIL_RE) || []);
    return found.filter(e => !EMAIL_BLOCKED.some(b => e.toLowerCase().includes(b)));
  }

  // ── STEP 1: 네이버 웹 검색 → 홈페이지 URL ──────────────────────────
  let homepage = '';
  let webItems = [];
  try {
    const url = `https://openapi.naver.com/v1/search/webkr.json?query=${encodeURIComponent(q + ' 공식 홈페이지')}&display=5`;
    const r = await fetch(url, {
      headers: { 'X-Naver-Client-Id': NAVER_ID, 'X-Naver-Client-Secret': NAVER_SECRET }
    });
    const data = await r.json();
    webItems = data.items || [];
    for (const item of webItems) {
      const link = cleanTag(item.link || '');
      if (link && !BLOCKED.some(b => link.includes(b))) {
        homepage = link;
        break;
      }
    }
  } catch(e) {}

  // ── STEP 2: 네이버 지역 검색 → 주소·전화번호 ──────────────────────
  let address = '', telephone = '', category = '';
  try {
    const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(q)}&display=3&sort=random`;
    const r = await fetch(url, {
      headers: { 'X-Naver-Client-Id': NAVER_ID, 'X-Naver-Client-Secret': NAVER_SECRET }
    });
    const data = await r.json();
    const localItems = data.items || [];
    if (localItems.length) {
      const item = localItems[0];
      address   = cleanTag(item.roadAddress || item.address || '');
      telephone = cleanTag(item.telephone || '');
      category  = cleanTag(item.category  || '');
      // 홈페이지가 없고 link가 있으면 사용
      if (!homepage && item.link) {
        const link = cleanTag(item.link);
        if (!BLOCKED.some(b => link.includes(b))) homepage = link;
      }
    }
  } catch(e) {}

  // ── STEP 3: 홈페이지 크롤링 → 이메일 추출 ─────────────────────────
  let email = '';

  if (homepage) {
    try {
      // 메인 페이지
      const r = await fetch(homepage, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(6000),
        redirect: 'follow',
      });
      const html = await r.text();
      const emails = extractEmails(html);
      if (emails.length) email = emails[0];

      // 메인에서 못 찾으면 연락처 페이지 탐색
      if (!email) {
        const contactRe = /href=["']([^"']*(?:contact|about|intro|company|연락|소개|about-us)[^"']*)["']/gi;
        const contactLinks = [];
        let m;
        const base = new URL(homepage);
        while ((m = contactRe.exec(html)) !== null) {
          try {
            const href = m[1];
            const full = href.startsWith('http') ? href : new URL(href, base.origin).href;
            if (!contactLinks.includes(full)) contactLinks.push(full);
          } catch(e) {}
        }
        for (const link of contactLinks.slice(0, 2)) {
          try {
            const cr = await fetch(link, {
              headers: { 'User-Agent': 'Mozilla/5.0' },
              signal: AbortSignal.timeout(5000),
              redirect: 'follow',
            });
            const chtml = await cr.text();
            const cemails = extractEmails(chtml);
            if (cemails.length) { email = cemails[0]; break; }
          } catch(e) {}
        }
      }
    } catch(e) {}
  }

  // ── STEP 4: 이메일 못 찾으면 Hunter.io 도메인 검색 ─────────────────
  let hunterUsed = false;
  if (!email && homepage && HUNTER_KEY) {
    try {
      let domain = '';
      try { domain = new URL(homepage).hostname.replace(/^www\./, ''); } catch(e) {}
      if (domain) {
        const hUrl = `https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${HUNTER_KEY}&limit=1`;
        const hr = await fetch(hUrl, { signal: AbortSignal.timeout(6000) });
        const hData = await hr.json();
        const hEmails = hData.data?.emails || [];
        if (hEmails.length) {
          email = hEmails[0].value;
          hunterUsed = true;
        }
        // 패턴만 있고 이메일 없으면 패턴으로 추정
        if (!email && hData.data?.pattern && hData.data?.domain) {
          const pattern = hData.data.pattern;  // {first}.{last} 등
          email = `(패턴: ${pattern}@${hData.data.domain})`;
          hunterUsed = true;
        }
      }
    } catch(e) {}
  }

  // ── STEP 5: 웹 검색 description에서 이메일 마지막 시도 ──────────────
  if (!email) {
    for (const item of webItems) {
      const text = cleanTag((item.description || '') + (item.title || ''));
      const found = extractEmails(text);
      if (found.length) { email = found[0]; break; }
    }
  }

  res.status(200).json({
    homepage,
    email,
    address,
    telephone,
    category,
    hunterUsed,
    webCount: webItems.length,
  });
}
