// F14 surveys page (US-040/US-045): fully voluntary research surveys with
// EXPLICIT consent, typed questions only, and an aggregate-only report
// view. Skipping or withdrawing never affects any other feature.

export async function createPage({ root, params, ctx }) {
  const api = ctx.surveysApi;
  const el = document.createElement("div");
  el.className = "fb-page";
  el.innerHTML = `
    <h1>Khảo sát tự nguyện</h1>
    <p id="sv-consent" class="fb-status">Đang tải…</p>
    <div id="sv-consent-actions">
      <button class="fb-button" id="sv-grant">Đồng ý tham gia nghiên cứu</button>
      <button class="fb-button fb-button--secondary" id="sv-withdraw">Rút đồng ý</button>
    </div>
    <p class="fb-status">Từ chối hoặc rút đồng ý KHÔNG ảnh hưởng bất kỳ
    tính năng nào khác của app.</p>
    <h2>Các khảo sát</h2>
    <ul class="fb-list" id="sv-forms"><li>Đang tải…</li></ul>
    <p id="sv-status" class="fb-status" role="status" aria-live="polite"></p>
  `;
  root.appendChild(el);

  const status = el.querySelector("#sv-status");
  const consentText = el.querySelector("#sv-consent");
  const answers = {};

  function setStatus(text, kind = "info") {
    status.className = `fb-status fb-status--${kind}`;
    status.textContent = text;
  }

  async function loadConsent() {
    try {
      const data = await api.consentStatus();
      const pre = (data.consents || []).find(
        (row) => row.purpose === "pre_post_study");
      consentText.textContent = !pre
        ? "Bạn chưa đồng ý tham gia nghiên cứu — hoàn toàn không bắt buộc."
        : (pre.status === "granted"
          ? `Đồng ý đang hiệu lực (bản ${pre.consent_version}).`
          : "Bạn đã rút đồng ý — không có dữ liệu nào được tính.");
    } catch (err) {
      consentText.textContent = "Không tải được trạng thái đồng ý.";
    }
  }

  function renderForms(forms) {
    const list = el.querySelector("#sv-forms");
    list.textContent = "";
    if (!forms.length) {
      const li = document.createElement("li");
      li.textContent = "Chưa có khảo sát nào đang mở.";
      list.appendChild(li);
      return;
    }
    for (const form of forms) {
      const li = document.createElement("li");
      const title = document.createElement("span");
      title.textContent = form.title;
      li.appendChild(title);
      const open = document.createElement("button");
      open.className = "fb-button fb-button--secondary";
      open.textContent = "Điền khảo sát";
      open.addEventListener("click", () => renderForm(form));
      li.appendChild(open);
      list.appendChild(li);
    }
  }

  function renderForm(form) {
    const list = el.querySelector("#sv-forms");
    list.textContent = "";
    const back = document.createElement("button");
    back.className = "fb-button fb-button--secondary";
    back.textContent = "Quay lại";
    back.addEventListener("click", () => { loadForms(); });
    const title = document.createElement("p");
    title.textContent = `${form.title} (bản ${form.revision})`;
    list.appendChild(title);
    for (const q of form.questions || []) {
      const row = document.createElement("div");
      const label = document.createElement("label");
      label.textContent = q.q_key + (q.required ? " *" : "");
      row.appendChild(label);
      if (q.kind === "scale_1_5") {
        for (let value = 1; value <= 5; value++) {
          const option = document.createElement("button");
          option.className = "fb-chip";
          option.textContent = String(value);
          option.addEventListener("click", () => {
            answers[q.q_key] = value;
            setStatus(`Đã chọn ${value} cho ${q.q_key}.`, "info");
          });
          row.appendChild(option);
        }
      } else if (q.kind === "choice") {
        for (const choice of q.choices || []) {
          const option = document.createElement("button");
          option.className = "fb-chip";
          option.textContent = choice;
          option.addEventListener("click", () => {
            answers[q.q_key] = choice;
            setStatus(`Đã chọn "${choice}" cho ${q.q_key}.`, "info");
          });
          row.appendChild(option);
        }
      } else if (q.kind === "number") {
        const input = document.createElement("input");
        input.type = "number";
        input.addEventListener("change", () => {
          const parsed = Number(input.value);
          if (!Number.isNaN(parsed)) answers[q.q_key] = parsed;
        });
        row.appendChild(input);
      }
      list.appendChild(row);
    }
    const submit = document.createElement("button");
    submit.className = "fb-button";
    submit.textContent = "Gửi câu trả lời";
    submit.addEventListener("click", async () => {
      try {
        await api.submit({ formKey: form.form_key,
          formRevision: form.revision, phase: "pre", answers: { ...answers } });
        setStatus("Đã gửi. Cảm ơn bạn!", "success");
        loadForms();
      } catch (err) {
        const code = err && err.code;
        if (code === "consent_required") {
          setStatus("Cần đồng ý tham gia nghiên cứu trước.", "error");
        } else {
          setStatus("Gửi chưa thành công. Kiểm tra các câu trả lời.", "error");
        }
      }
    });
    list.appendChild(submit);
    list.appendChild(back);
  }

  async function loadForms() {
    try {
      const data = await api.forms();
      renderForms(data.results || []);
    } catch (err) {
      setStatus("Không tải được khảo sát. Thử lại.", "error");
    }
  }

  el.querySelector("#sv-grant").addEventListener("click", async () => {
    try {
      await api.setConsent({ purpose: "pre_post_study", decision: "grant" });
      await loadConsent();
      setStatus("Đã ghi nhận đồng ý của bạn.", "success");
    } catch (err) {
      setStatus("Không ghi nhận được.", "error");
    }
  });

  el.querySelector("#sv-withdraw").addEventListener("click", async () => {
    try {
      await api.setConsent({ purpose: "pre_post_study",
        decision: "withdraw" });
      await loadConsent();
      setStatus("Đã rút đồng ý. Không ảnh hưởng tính năng khác.", "info");
    } catch (err) {
      setStatus("Không rút được. Thử lại.", "error");
    }
  });

  await Promise.all([loadConsent(), loadForms()]);

  return {
    destroy() { el.remove(); },
  };
}
