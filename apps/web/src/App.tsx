import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { 
  ConfigProvider, theme, Layout, Menu, Button, Card, Grid, message, Form, Typography 
} from 'antd';
import {
  PlusOutlined,
  AppstoreOutlined,
  SettingOutlined,
  UserOutlined,
  MenuOutlined
} from '@ant-design/icons';
import './index.css';
import type { Project, LogEntry } from './types';
import { DashboardView, CreateView, EditorView } from './views';

const { Header, Sider } = Layout;
const { Title } = Typography;
const { useBreakpoint } = Grid;

const MOCK_USER_ID = 'demo-user-123'; // Hardcoded for this demo

function AppContent() {
  const screens = useBreakpoint();
  const isMobile = !screens.lg;
  
  // Start collapsed on mobile, open on desktop
  const [collapsed, setCollapsed] = useState(isMobile);
  const [projects, setProjects] = useState<Project[]>([]);
  const [jobLogs, setJobLogs] = useState<Record<string, LogEntry[]>>({});
  const [form] = Form.useForm();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const navigate = useNavigate();
  const location = useLocation();

  // Auto-collapse when screen size changes to mobile
  useEffect(() => {
    if (isMobile) {
      setCollapsed(true);
    } else {
      setCollapsed(false);
    }
  }, [isMobile]);

  // Fetch initial jobs
  useEffect(() => {
    fetch(`/api/jobs?userId=${MOCK_USER_ID}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setProjects(data);
        }
      })
      .catch(err => console.error("Failed to fetch jobs:", err));
  }, []);

  // Listen to SSE updates
  useEffect(() => {
    const sse = new EventSource('/api/jobs/stream');
    
    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.userId !== MOCK_USER_ID) return;

        if (data.type === 'LOG') {
          const { jobId, event: opencodeEvent } = data;
          
          let logEntry: LogEntry | null = null;

          // OpenCode events can be:
          // 1. Tool calls
          if (opencodeEvent.type === 'call' || opencodeEvent.call) {
            const toolCall = opencodeEvent.call || opencodeEvent;
            let message = `Calling tool: ${toolCall.name}`;

            if (toolCall.name === 'run_shell_command') {
              message = `Running: ${toolCall.arguments.command}`;
            } else if (toolCall.name === 'write_file') {
              message = `Writing file: ${toolCall.arguments.file_path}`;
            }

            logEntry = {
              timestamp: new Date().toLocaleTimeString(),
              message,
              type: 'call'
            };

            // Check for screenshots in tool arguments
            const argsString = JSON.stringify(toolCall.arguments);
            const pngMatch = argsString.match(/demo\/[^"\s]+\.png/);
            if (pngMatch) {
              logEntry.screenshot = `/${pngMatch[0]}`;
            }
          } 
          // 2. Tool responses
          else if (opencodeEvent.type === 'response' || opencodeEvent.output) {
            logEntry = {
              timestamp: new Date().toLocaleTimeString(),
              message: `Task step completed`,
              type: 'response'
            };
          } 
          // 3. Agent thought / text
          else if (opencodeEvent.type === 'text' || typeof opencodeEvent.text === 'string') {
            const text = opencodeEvent.text || opencodeEvent;
            logEntry = {
              timestamp: new Date().toLocaleTimeString(),
              message: typeof text === 'string' ? text : JSON.stringify(text),
              type: 'text'
            };
          }

          if (logEntry) {
            setJobLogs(prev => ({
              ...prev,
              [jobId]: [...(prev[jobId] || []), logEntry!]
            }));
          }
        } else {
          const updatedJob = data;
          setProjects(prev => {
            const exists = prev.find(p => p.id === updatedJob.id);
            if (exists) {
              return prev.map(p => p.id === updatedJob.id ? updatedJob : p);
            } else {
              return [...prev, updatedJob];
            }
          });
        }
      } catch (err) {
        console.error("SSE Parsing error", err);
      }
    };

    return () => {
      sse.close();
    };
  }, []);

  const handleQueueJob = async (values: any) => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: MOCK_USER_ID,
          parameters: {
            url: values.url,
            instructions: values.instructions,
            script: values.script
          }
        })
      });
      
      if (!res.ok) throw new Error("Failed to queue job");
      
      message.success("Video generation queued successfully!");
      form.resetFields();
      navigate('/dashboard');
    } catch (err: any) {
      message.error(err.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
      setProjects(prev => prev.filter(p => p.id !== id));
      message.success("Job deleted");
    } catch (err) {
      message.error("Failed to delete job");
    }
  };

  // Determine current active menu key based on pathname
  let selectedKey = 'dashboard';
  if (location.pathname.startsWith('/new')) {
    selectedKey = 'create';
  } else if (location.pathname.startsWith('/editor')) {
    selectedKey = 'dashboard'; // Editor usually stems from dashboard in this UI
  }

  return (
    <Layout style={{ height: '100vh', width: '100vw' }}>
      <Sider 
        collapsible 
        collapsed={collapsed} 
        onCollapse={(value) => setCollapsed(value)}
        breakpoint="lg"
        collapsedWidth={0}
        width={240}
        trigger={null}
        style={{ 
          borderRight: '1px solid #303030', 
          background: '#141414',
          zIndex: 1000,
          position: isMobile ? 'absolute' : 'relative',
          height: '100%',
          top: 0,
          left: 0,
          boxShadow: isMobile && !collapsed ? '4px 0 24px rgba(0,0,0,0.5)' : 'none'
        }}
      >
        <div style={{ padding: '24px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #1677ff, #722ed1)', borderRadius: 8, flexShrink: 0 }}></div>
            <Title level={4} style={{ margin: 0, whiteSpace: 'nowrap', opacity: collapsed ? 0 : 1, transition: 'opacity 0.2s' }}>Silverfish</Title>
          </div>
          {isMobile && !collapsed && (
             <Button type="text" icon={<MenuOutlined />} onClick={() => setCollapsed(true)} style={{ color: '#fff' }} />
          )}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          style={{ background: 'transparent', borderRight: 0 }}
          items={[
            { key: 'dashboard', icon: <AppstoreOutlined />, label: 'Dashboard', onClick: () => { navigate('/dashboard'); if(isMobile) setCollapsed(true); } },
            { key: 'create', icon: <PlusOutlined />, label: 'New Video', onClick: () => { navigate('/new'); if(isMobile) setCollapsed(true); } },
            { type: 'divider' },
            { key: 'settings', icon: <SettingOutlined />, label: 'Settings' },
          ]}
        />
        <div style={{ position: 'absolute', bottom: 24, left: 16, right: 16, opacity: collapsed ? 0 : 1, transition: 'opacity 0.2s', pointerEvents: collapsed ? 'none' : 'auto' }}>
          <Card size="small" style={{ background: '#1f1f1f', borderColor: '#303030' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ background: '#333', padding: 8, borderRadius: '50%', display: 'flex' }}><UserOutlined /></div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Pro Plan</div>
                <div style={{ fontSize: 11, color: '#888' }}>12/50 mins</div>
              </div>
            </div>
          </Card>
        </div>
      </Sider>
      <Layout style={{ background: '#000', position: 'relative', transition: 'all 0.2s' }}>
        <Header style={{ background: '#141414', padding: '0 16px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #303030', height: 64 }}>
          <Button 
            type="text" 
            icon={collapsed ? <MenuOutlined /> : <MenuOutlined />} 
            onClick={() => setCollapsed(!collapsed)}
            style={{ color: '#fff', fontSize: 20 }}
          />
          {collapsed && <div style={{ marginLeft: 16, fontWeight: 600, transition: 'opacity 0.3s' }}>Silverfish</div>}
        </Header>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardView projects={projects} isMobile={isMobile} onDelete={handleDelete} />} />
          <Route path="/new" element={<CreateView isMobile={isMobile} form={form} isSubmitting={isSubmitting} onQueueJob={handleQueueJob} />} />
          <Route path="/editor/:id" element={<EditorView projects={projects} jobLogs={jobLogs} isMobile={isMobile} />} />
        </Routes>
      </Layout>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorPrimary: '#1677ff', borderRadius: 8 } }}>
        <AppContent />
      </ConfigProvider>
    </BrowserRouter>
  );
}
