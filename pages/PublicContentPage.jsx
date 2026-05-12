import React from "react";
import { Link, useLocation } from "react-router-dom";

const NAV_ITEMS = [
    { path: "/about", label: "서비스 소개" },
    { path: "/guide", label: "플레이 가이드" },
    { path: "/privacy", label: "개인정보처리방침" },
    { path: "/terms", label: "이용약관" },
];

const PAGES = {
    "/about": {
        eyebrow: "Wiki Race",
        title: "링크를 읽고 길을 찾는 위키 레이스",
        description:
            "Wiki Race는 위키백과 문서의 내부 링크만 따라가 목표 문서에 도착하는 탐색형 웹 게임입니다. 단순한 클릭 경쟁이 아니라 문서의 맥락, 단어의 연결성, 주제 간 거리를 빠르게 판단하는 능력을 겨룹니다.",
        sections: [
            {
                title: "이 사이트가 제공하는 가치",
                body:
                    "플레이어는 매 라운드마다 시작 문서와 목표 문서를 받고, 본문 속 링크를 읽으며 다음 이동을 선택합니다. 기록에는 도착 시간, 이동 횟수, 실제 이동 경로가 함께 남기 때문에 단순 점수보다 탐색 과정 자체를 돌아볼 수 있습니다.",
            },
            {
                title: "위키 콘텐츠를 게임 경험으로 재구성",
                body:
                    "위키 문서는 원문 그대로 소비하면 정보량이 너무 많을 수 있습니다. 이 서비스는 게임 목표, 이동 제한, 경로 기록, 랭킹, 실시간 대전이라는 구조를 더해 사용자가 문서 사이의 관계를 능동적으로 탐색하도록 설계했습니다.",
            },
            {
                title: "주요 기능",
                body:
                    "싱글 플레이에서는 개인 기록과 경로를 확인할 수 있고, 1대1 및 그룹 모드에서는 친구들과 서로 다른 목표를 설정해 실시간으로 겨룰 수 있습니다. 아이템 모드는 링크 강조, 검색 1회 사용, 뒤로가기, 랜덤 이동처럼 레이스에 변수를 더합니다.",
            },
        ],
    },
    "/guide": {
        eyebrow: "Guide",
        title: "처음 시작하는 플레이어를 위한 전략 가이드",
        description:
            "좋은 기록은 운만으로 나오지 않습니다. 문서 제목, 첫 문단의 핵심어, 분류에 가까운 단어, 인물과 사건의 연결고리를 빠르게 읽어내는 습관이 중요합니다.",
        sections: [
            {
                title: "1. 시작 문서의 성격을 먼저 파악하기",
                body:
                    "첫 화면에서는 문서 전체를 꼼꼼히 읽기보다 제목, 요약, 빠른 이동 링크를 먼저 훑는 편이 좋습니다. 인물 문서라면 국적, 직업, 관련 사건을 보고, 기술 문서라면 분야와 상위 개념을 찾는 식으로 다음 후보를 좁힐 수 있습니다.",
            },
            {
                title: "2. 목표 문서를 직접 찾기보다 주변 개념으로 접근하기",
                body:
                    "목표가 특정 인물이라면 출생지, 활동 분야, 소속 단체 같은 주변 개념으로 이동하는 편이 빠를 때가 많습니다. 목표가 장소라면 국가, 행정구역, 역사 사건을 거치는 경로가 자주 열립니다.",
            },
            {
                title: "3. 이동 횟수와 시간의 균형 잡기",
                body:
                    "무조건 적은 클릭만 노리면 한 문서에서 너무 오래 머무를 수 있습니다. 반대로 빠르게 누르기만 하면 엉뚱한 주제로 멀어질 수 있습니다. 처음에는 5초 안에 후보 2개를 고르고, 가장 넓은 주제 연결을 가진 링크를 선택하는 연습이 좋습니다.",
            },
            {
                title: "4. 아이템 모드 활용법",
                body:
                    "링크 하이라이트는 막힌 상황에서 방향을 잡는 데 유용하고, 뒤로가기는 잘못 들어간 문서에서 손실을 줄여줍니다. 검색 아이템은 목표 문서명 자체보다 목표와 가까운 핵심어를 확인하는 용도로 쓰면 성공률이 높습니다.",
            },
            {
                title: "5. 기록을 개선하는 복기 방법",
                body:
                    "게임이 끝난 뒤에는 이동 경로를 보고 왜 그 링크를 눌렀는지 되짚어보세요. 같은 목표라도 좋은 경로와 우회 경로가 갈립니다. 반복 플레이에서 자주 등장하는 연결어를 기억하면 다음 라운드에서 훨씬 빠르게 반응할 수 있습니다.",
            },
        ],
    },
    "/privacy": {
        eyebrow: "Policy",
        title: "개인정보처리방침",
        description:
            "Wiki Race는 게임 진행과 계정 기능 제공에 필요한 최소한의 정보를 사용합니다. 이 문서는 사이트 이용자가 어떤 정보가 저장되고 어떤 목적으로 사용되는지 쉽게 확인할 수 있도록 작성되었습니다.",
        sections: [
            {
                title: "수집하는 정보",
                body:
                    "회원 기능을 사용할 경우 아이디, 닉네임, 프로필 이미지 주소, 게임 기록, 랭킹 기록, 대전 결과가 저장될 수 있습니다. 게스트 모드는 서버 랭킹 저장 없이 브라우저의 로컬 저장소를 활용할 수 있습니다.",
            },
            {
                title: "이용 목적",
                body:
                    "수집된 정보는 로그인 유지, 프로필 표시, 게임 기록 저장, 랭킹 제공, 멀티플레이 방 참여 및 결과 확인을 위해 사용됩니다. 광고를 사용하는 경우 광고 네트워크가 쿠키 또는 유사 기술을 사용할 수 있습니다.",
            },
            {
                title: "보관 및 삭제",
                body:
                    "계정 기반 기록은 서비스 운영에 필요한 기간 동안 보관됩니다. 이용자가 삭제를 요청하거나 운영상 더 이상 보관할 필요가 없다고 판단되는 경우 관련 기록을 삭제할 수 있습니다.",
            },
            {
                title: "문의",
                body:
                    "개인정보와 서비스 운영에 관한 문의는 사이트 운영자에게 연락해 처리할 수 있습니다. 운영자는 문의 내용을 확인한 뒤 가능한 범위에서 수정, 삭제, 안내를 제공합니다.",
            },
        ],
    },
    "/terms": {
        eyebrow: "Terms",
        title: "이용약관",
        description:
            "이 약관은 Wiki Race를 이용할 때 필요한 기본적인 이용 조건을 설명합니다. 서비스의 원활한 운영과 공정한 플레이 환경을 위해 아래 내용을 확인해주세요.",
        sections: [
            {
                title: "서비스 이용",
                body:
                    "사용자는 위키 문서 링크를 따라 목표 문서에 도달하는 게임, 개인 기록, 랭킹, 멀티플레이 기능을 이용할 수 있습니다. 일부 기능은 로그인 또는 외부 서비스 설정 상태에 따라 제한될 수 있습니다.",
            },
            {
                title: "공정한 플레이",
                body:
                    "자동화 도구, 비정상적인 요청 반복, 시스템 취약점 악용, 다른 이용자의 플레이를 방해하는 행위는 제한될 수 있습니다. 기록 조작이 의심되는 경우 랭킹에서 제외될 수 있습니다.",
            },
            {
                title: "콘텐츠와 외부 자료",
                body:
                    "게임 진행에 사용되는 위키 문서 요약과 링크 정보는 외부 공개 API를 통해 제공될 수 있습니다. Wiki Race는 이를 게임 규칙, 경로 기록, 랭킹, 대전 기능과 결합해 별도의 플레이 경험으로 제공합니다.",
            },
            {
                title: "서비스 변경",
                body:
                    "운영상 필요에 따라 기능, 디자인, 랭킹 기준, 아이템 규칙은 변경될 수 있습니다. 중요한 변경이 있을 경우 사이트 내 안내 또는 업데이트 내용을 통해 공지할 수 있습니다.",
            },
        ],
    },
};

export default function PublicContentPage() {
    const location = useLocation();
    const page = PAGES[location.pathname] || PAGES["/about"];

    return (
        <main className="public-page">
            <nav className="public-nav" aria-label="공개 문서">
                <Link to="/" className="public-brand">Wiki Race</Link>
                <div className="public-nav-links">
                    {NAV_ITEMS.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={location.pathname === item.path ? "active" : ""}
                        >
                            {item.label}
                        </Link>
                    ))}
                </div>
            </nav>

            <article className="public-article">
                <p className="public-eyebrow">{page.eyebrow}</p>
                <h1>{page.title}</h1>
                <p className="public-lead">{page.description}</p>

                <div className="public-section-list">
                    {page.sections.map((section) => (
                        <section key={section.title} className="public-section">
                            <h2>{section.title}</h2>
                            <p>{section.body}</p>
                        </section>
                    ))}
                </div>
            </article>
        </main>
    );
}
