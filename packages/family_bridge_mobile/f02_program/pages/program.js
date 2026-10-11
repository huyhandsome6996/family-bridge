// F02 program page (US-036/US-044): voluntary 4-week companion program.
// ALL published weeks stay viewable — the suggested week never locks
// anything. Progress is personal; the family agreement needs EACH
// person's own acceptance; paper notebook is always an option.

export async function createPage({ root, params, ctx }) {
  const api = ctx.programApi;
  const el = document.createElement("div");
  el.className = "fb-page";
  el.innerHTML = `
    <h1>Đồng hành 4 tuần</h1>
    <section id="pg-enroll">
      <p class="fb-status">Tham gia hoàn toàn tự nguyện — bạn có thể nghỉ
      bất cứ lúc nào, không điểm, không xếp hạng.</p>
      <button class="fb-button" id="pg-join">Tham gia chương trình</button>
    </section>
    <section id="pg-content" hidden>
      <p id="pg-agreement" class="fb-status"></p>
      <button class="fb-button fb-button--secondary" id="pg-accept">Tôi đồng ý thỏa ước</button>
      <div id="pg-weeks"></div>
      <p id="pg-paper" class="fb-status">Bạn hoàn toàn có thể dùng sổ giấy —
      không bắt buộc ghi trong app.</p>
      <button class="fb-button fb-button--secondary" id="pg-leave">Nghỉ chương trình</button>
    </section>
    <p id="pg-status" class="fb-status" role="status" aria-live="polite"></p>
  `;
  root.appendChild(el);

  const status = el.querySelector("#pg-status");
  let programKey = "family-4w";

  function setStatus(text, kind = "info") {
    status.className = `fb-status fb-status--${kind}`;
    status.textContent = text;
  }

  function renderWeeks(data) {
    el.querySelector("#pg-enroll").hidden = true;
    el.querySelector("#pg-content").hidden = false;
    const agreement = data.agreement || {};
    el.querySelector("#pg-agreement").textContent = agreement.accepted_by_me
      ? `Bạn đã đồng ý thỏa ước (bản ${agreement.revision}).`
      : `Thỏa ước bản ${agreement.revision} đang chờ bạn xác nhận (mỗi người tự đồng ý).`;
    const wrap = el.querySelector("#pg-weeks");
    wrap.textContent = "";
    for (const week of data.weeks || []) {
      const card = document.createElement("div");
      card.className = "fb-card";
      const title = document.createElement("h2");
      title.textContent = `Tuần ${week.week_no}: ${week.title}` +
        (data.suggested_week === week.week_no ? " (gợi ý)" : "");
      const goal = document.createElement("p");
      goal.textContent = (week.goals || []).join("; ");
      const mine = document.createElement("p");
      mine.textContent = `Học sinh: ${week.student_guide}`;
      const theirs = document.createElement("p");
      theirs.textContent = `Người đồng hành: ${week.caregiver_guide}`;
      card.appendChild(title);
      card.appendChild(goal);
      card.appendChild(mine);
      card.appendChild(theirs);
      for (const activity of week.activities || []) {
        const row = document.createElement("p");
        const stateText = { done: "đã làm", skipped: "đã bỏ qua",
          reset: "chưa làm" }[activity.status] || "chưa làm";
        row.textContent = `Hoạt động ${activity.activity_key} — ${stateText}`;
        const done = document.createElement("button");
        done.className = "fb-button fb-button--secondary";
        done.textContent = "Mình đã làm";
        done.addEventListener("click", async () => {
          try {
            await api.progress({ programKey, weekNo: week.week_no,
              activityKey: activity.activity_key, status: "done" });
            setStatus("Đã ghi nhận riêng cho bạn.", "success");
            await loadWeeks();
          } catch (err) {
            setStatus("Không ghi nhận được.", "error");
          }
        });
        const skip = document.createElement("button");
        skip.className = "fb-button fb-button--secondary";
        skip.textContent = "Bỏ qua";
        skip.addEventListener("click", async () => {
          try {
            await api.progress({ programKey, weekNo: week.week_no,
              activityKey: activity.activity_key, status: "skipped" });
            await loadWeeks();
          } catch (err) {
            setStatus("Không ghi nhận được.", "error");
          }
        });
        row.appendChild(done);
        row.appendChild(skip);
        card.appendChild(row);
      }
      wrap.appendChild(card);
    }
  }

  async function loadWeeks() {
    try {
      const data = await api.weeks(programKey);
      renderWeeks(data);
    } catch (err) {
      el.querySelector("#pg-enroll").hidden = false;
      el.querySelector("#pg-content").hidden = true;
    }
  }

  el.querySelector("#pg-join").addEventListener("click", async () => {
    try {
      const catalog = await api.catalog();
      const current = (catalog.results || []).find(
        (p) => p.program_key === programKey);
      if (!current) {
        setStatus("Chưa có chương trình nào được xuất bản.", "error");
        return;
      }
      await api.enroll({ programKey, programRevision: current.revision });
      setStatus("Đã tham gia. Bạn có thể nghỉ bất cứ lúc nào.", "success");
      await loadWeeks();
    } catch (err) {
      setStatus("Không tham gia được. Thử lại.", "error");
    }
  });

  el.querySelector("#pg-accept").addEventListener("click", async () => {
    try {
      await api.acceptAgreement(programKey);
      setStatus("Đã ghi nhận sự đồng ý của BẠN. Người đồng hành tự xác nhận phần của họ.", "success");
      await loadWeeks();
    } catch (err) {
      setStatus("Không ghi nhận được. Thử lại.", "error");
    }
  });

  el.querySelector("#pg-leave").addEventListener("click", async () => {
    try {
      await api.optOut(programKey);
      setStatus("Đã nghỉ. Không sao cả — bạn luôn quay lại được khi muốn.", "info");
      el.querySelector("#pg-enroll").hidden = false;
      el.querySelector("#pg-content").hidden = true;
    } catch (err) {
      setStatus("Không nghỉ được. Thử lại.", "error");
    }
  });

  await loadWeeks();

  return {
    destroy() { el.remove(); },
  };
}
