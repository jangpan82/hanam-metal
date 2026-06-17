export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { q } = req.query;
  if (!q) { res.status(400).json({ error: 'q is required' }); return; }

  const CLIENT_ID     = 'rBWxvoRqHS9p8UoKXb98';
  const CLIENT_SECRET = 'wnohEofX0o';

  try {
    // 1) 네이버 웹 검색으로 홈페이지 URL 탐색
    const searchUrl = `https://openapi.naver.com/v1/search/webkr.json?query=${encodeURIComponent(q + ' 공식 홈페이지')}&display=5&start=1`;
    const webRes = await fetch(searchUrl, {
      headers: {
        'X-Naver-Client-Id': CLIENT_ID,
        'X-Naver-Client-Secret': CLIENT_SECRET,
      }
    });
    const webData = await webRes.json();
    const webItems = webData.items || [];

    // 2) 네이버 지역 검색으로 전화번호·주소·카테고리 탐색
    const localUrl = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(q)}&display=3&start=1&sort=random`;
    const localRes = await fetch(localUrl, {
      headers: {
        'X-Naver-Client-Id': CLIENT_ID,
        'X-Naver-Client-Secret': CLIENT_SECRET,
      }
    });
    const localData = await localRes.json();
    const localItems = localData.items || [];

    // 3) 홈페이지 URL 추출 — 회사 공식 사이트 우선
    let homepage = '';
    const blocked = ['naver.com','kakao.com','google.com','daum.net','instagram.com',
                     'facebook.com','youtube.com','blog.','news.','cafe.','map.',
                     'shopping.','wiki','나무위키','tistory.com','blogspot'];

    for (const item of webItems) {
      const link = item.link || '';
      if (link && !blocked.some(b => link.includes(b))) {
        homepage = link.replace(/<[^>]*>/g, '');
        break;
      }
    }

    // 4) 이메일 추출 — 웹 검색 결과 description에서 패턴 매칭
    let email = '';
    const emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    for (const item of webItems) {
      const desc = (item.description || '') + (item.title || '');
      const found = desc.replace(/<[^>]*>/g, '').match(emailRe);
      if (found) {
        const filtered = found.filter(e => !['naver','kakao','google','example'].some(b => e.includes(b)));
        if (filtered.length) { email = filtered[0]; break; }
      }
    }

    // 5) 지역검색에서 추가 정보
    const localItem = localItems[0] || {};
    const address = (localItem.roadAddress || localItem.address || '').replace(/<[^>]*>/g, '');
    const telephone = (localItem.telephone || '').replace(/<[^>]*>/g, '');
    const category = (localItem.category || '').replace(/<[^>]*>/g, '');

    res.status(200).json({
      homepage,
      email,
      address,
      telephone,
      category,
      webCount: webItems.length,
      localCount: localItems.length,
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
