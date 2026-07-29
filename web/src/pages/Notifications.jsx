import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { date } from "../lib/format.js";
import { Loader, Empty } from "../components/ui.jsx";

export default function Notifications() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.notifications().then((d) => {
      setData(d);
      if (d.unread > 0) api.readNotifications().catch(() => {});
    });
  }, []);

  if (!data) return <Loader />;

  return (
    <div className="screen">
      <p className="eyebrow">Уведомления</p>
      {data.items.length === 0 ? (
        <Empty title="Тихо" text="Здесь появятся вердикты проверок и новые достижения." />
      ) : (
        <div className="card" style={{ marginTop: 12 }}>
          {data.items.map((n, i) => (
            <div key={n.id} className={`notif stagger ${n.read ? "" : "unread"}`} style={{ "--i": i }}>
              <div className="row between">
                <span style={{ fontWeight: 600 }}>{n.title}</span>
                <span className="mono muted" style={{ fontSize: 11 }}>{date(n.createdAt)}</span>
              </div>
              <p className="muted" style={{ margin: "2px 0 0" }}>{n.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
