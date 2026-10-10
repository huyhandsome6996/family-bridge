import { useState } from "react";
import { Box, Button, Page, Text } from "zmp-ui";
import { api } from "../api";

function HomePage() {
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState("Chưa kiểm tra kết nối.");
  const checkBackend = async () => {
    setChecking(true);
    try {
      const result = await api("/api/v1/ready/");
      setStatus(result.status === "ok" ? "Đã kết nối backend và cơ sở dữ liệu." : "Backend chưa sẵn sàng.");
    } catch (error) { setStatus(error.message); }
    finally { setChecking(false); }
  };
  return (
    <Page className="foundation-page">
      <Box className="foundation-intro">
        <Text.Title size="xLarge">Family Bridge</Text.Title>
        <Text>Nhịp cầu lắng nghe giữa học sinh và người đồng hành.</Text>
        <Text>Bản nền tảng đang phát triển. Đăng nhập và các tính năng đồng hành sẽ được bổ sung theo từng US.</Text>
      </Box>
      <Button fullWidth loading={checking} disabled={checking} onClick={checkBackend}>
        Kiểm tra kết nối
      </Button>
      <Box role="status" aria-live="polite"><Text>{status}</Text></Box>
    </Page>
  );
}

export default HomePage;
