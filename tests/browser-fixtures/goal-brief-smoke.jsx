import React from "react";
import { createRoot } from "react-dom/client";
import WikiViewer from "../../components/WikiViewer.jsx";
import "../../css/app.css";

function Fixture() {
  const [lastClick, setLastClick] = React.useState("");
  return (
    <main>
      <p data-testid="last-click">{lastClick || "미이동"}</p>
      <WikiViewer
        target={{
          title: "SQL",
          summary: "관계형 데이터베이스에서 데이터를 조회하고 수정할 때 사용되는 언어입니다.",
          summaryStatus: "success",
        }}
        currentTitle="김치"
        currentSummary="한국의 발효 음식"
        currentDocumentHtml={'<p><a href="#" data-wiki-title="서울특별시" class="wiki-inline-link">서울</a>에 관한 링크가 있습니다.</p>'}
        links={["서울특별시"]}
        isLoading={false}
        onLinkClick={setLastClick}
        openTargetBriefByDefault
      />
    </main>
  );
}

createRoot(document.getElementById("root")).render(<Fixture />);
