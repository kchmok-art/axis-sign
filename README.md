# AX:IS 명부 서명 허브
고정 주소에서 명단 입력 → 저장 → 서명 링크 발급 → 공유 → 서명 수집 → 관리/다운로드.

- `/` 명부 만들기
- `/s/{id}` 서명 페이지 (참석자 공유용)
- `/m/{id}?t={관리토큰}` 관리 페이지 (현황·마감·초기화·명단 수정·다운로드·인쇄)

## 실행 (Docker)
    docker build -t axis-sign .
    docker run -d --name axis-sign --restart unless-stopped -p 3001:3001 -v /root/axis-sign-data:/data axis-sign

환경변수: `CREATE_KEY`(설정 시 명부 생성에 키 필요), `PORT`, `DATA_DIR`
