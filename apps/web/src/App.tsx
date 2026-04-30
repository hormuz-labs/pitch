import { useState } from 'react';
import { 
  ConfigProvider, theme, Layout, Menu, Button, Card, Row, Col, 
  Tag, Form, Input, Steps, Typography, Space, Divider, Slider, Tabs, Select, Grid
} from 'antd';
import {
  VideoCameraOutlined,
  PlusOutlined,
  AppstoreOutlined,
  SettingOutlined,
  PlayCircleOutlined,
  ExportOutlined,
  UserOutlined,
  StepBackwardOutlined,
  StepForwardOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  MenuOutlined
} from '@ant-design/icons';
import './index.css';

const { Header, Content, Sider } = Layout;
const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

type View = 'dashboard' | 'create' | 'editor';

interface Project {
  id: string;
  title: string;
  status: 'completed' | 'processing';
  duration: string;
  createdAt: string;
}

const mockProjects: Project[] = [
  { id: '1', title: 'Payment Flow Demo', status: 'completed', duration: '01:45', createdAt: '2 mins ago' },
  { id: '2', title: 'Onboarding Sequence', status: 'processing', duration: '--:--', createdAt: 'In progress' },
  { id: '3', title: 'Settings Navigation', status: 'completed', duration: '00:30', createdAt: '1 hour ago' },
];

function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const screens = useBreakpoint();

  const isMobile = !screens.lg;

  const handleCreateNew = () => setCurrentView('create');
  const handleOpenEditor = (project: Project) => {
    setSelectedProject(project);
    setCurrentView('editor');
  };

  const renderDashboard = () => (
    <Content style={{ padding: isMobile ? '16px' : '32px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <Title level={isMobile ? 3 : 2} style={{ margin: 0 }}>My Videos</Title>
          <Text type="secondary">Manage and edit your generated product demos.</Text>
        </div>
        <Button type="primary" size={isMobile ? 'middle' : 'large'} icon={<PlusOutlined />} onClick={handleCreateNew}>
          Create New Video
        </Button>
      </div>

      <Row gutter={[24, 24]}>
        {mockProjects.map(project => (
          <Col xs={24} sm={12} lg={8} xl={6} key={project.id}>
            <Card
              hoverable
              onClick={() => handleOpenEditor(project)}
              cover={
                <div style={{ height: 160, background: '#141414', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #303030' }}>
                  <VideoCameraOutlined style={{ fontSize: 48, color: '#424242' }} />
                </div>
              }
              actions={[
                <Button type="link" onClick={(e) => { e.stopPropagation(); handleOpenEditor(project); }}>Edit</Button>,
                <Button type="link" danger onClick={(e) => e.stopPropagation()}>Delete</Button>
              ]}
            >
              <Card.Meta 
                title={project.title} 
                description={
                  <Space direction="vertical" size={2} style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                      {project.status === 'completed' ? (
                        <Tag icon={<CheckCircleOutlined />} color="success">Ready</Tag>
                      ) : (
                        <Tag icon={<ClockCircleOutlined />} color="processing">Processing</Tag>
                      )}
                      <Text type="secondary" style={{ fontSize: 12 }}>{project.duration}</Text>
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>Created {project.createdAt}</Text>
                  </Space>
                } 
              />
            </Card>
          </Col>
        ))}
      </Row>
    </Content>
  );

  const renderCreate = () => (
    <Content style={{ padding: isMobile ? '16px' : '32px', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ marginBottom: 32 }}>
          <Button type="link" style={{ padding: 0, marginBottom: 16 }} onClick={() => setCurrentView('dashboard')}>
            &larr; Back to Dashboard
          </Button>
          <Title level={isMobile ? 3 : 2} style={{ margin: 0 }}>Generate AI Demo</Title>
          <Text type="secondary">Tell the AI agent what to record, and it will handle the rest.</Text>
        </div>

        <Row gutter={[32, 32]}>
          <Col xs={24} lg={16}>
            <Card bordered={false}>
              <Form layout="vertical" size="large">
                <Form.Item label="Product URL" required tooltip="The starting point for the agent.">
                  <Input placeholder="https://your-app.com/login" />
                </Form.Item>
                <Form.Item label="What should the AI agent do?" required tooltip="Provide step-by-step instructions.">
                  <Input.TextArea 
                    rows={6} 
                    placeholder="e.g. Log in with test@example.com, navigate to the billing section, click 'Upgrade to Pro', and show the success banner." 
                  />
                </Form.Item>
                <Form.Item label="Voiceover Script (Optional)" tooltip="Leave blank to let the AI generate one automatically based on the actions.">
                  <Input.TextArea rows={3} placeholder="Start by welcoming the user..." />
                </Form.Item>
                <Divider />
                <Button type="primary" size="large" block onClick={() => setCurrentView('dashboard')}>
                  Queue Generation
                </Button>
              </Form>
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card bordered={false} style={{ background: 'transparent' }}>
              <Title level={5}>How it works</Title>
              <Steps
                direction="vertical"
                size="small"
                current={0}
                items={[
                  { title: 'Queue Job', description: 'Your request is sent to our worker queue.' },
                  { title: 'Agent Navigation', description: 'A headless browser opens and follows your instructions.' },
                  { title: 'Video Synthesis', description: 'Interactions are recorded and stitched together.' },
                  { title: 'Voiceover & Polish', description: 'AI voiceover is added and aligned with the video.' },
                  { title: 'Ready for Edit', description: 'Review and tweak the final video in our editor.' },
                ]}
              />
            </Card>
          </Col>
        </Row>
      </div>
    </Content>
  );

  const renderEditor = () => (
    <Content style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Editor Header */}
      <div style={{ padding: '12px 24px', borderBottom: '1px solid #303030', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#141414', zIndex: 10 }}>
        <Space>
          <Button onClick={() => setCurrentView('dashboard')}>Exit</Button>
          {!isMobile && <Title level={5} style={{ margin: 0, marginLeft: 16 }}>{selectedProject?.title}</Title>}
        </Space>
        <Space>
          <Button icon={<SettingOutlined />} />
          <Button type="primary" icon={<ExportOutlined />}>Export</Button>
        </Space>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: isMobile ? 'column' : 'row' }}>
        {/* Main Work Area (Player + Timeline) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          
          {/* Video Player */}
          <div style={{ flex: 1, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: isMobile ? 200 : 300 }}>
            <div style={{ textAlign: 'center' }}>
              <PlayCircleOutlined style={{ fontSize: isMobile ? 48 : 64, color: '#555', cursor: 'pointer' }} />
              <div style={{ marginTop: 16, color: '#555' }}>Preview</div>
            </div>
            {/* Mock Caption Overlay */}
            <div style={{ position: 'absolute', bottom: 20, background: 'rgba(0,0,0,0.6)', padding: '8px 16px', borderRadius: 8, border: '1px solid #333', maxWidth: '90%' }}>
              <Text style={{ fontSize: isMobile ? 12 : 14 }}>"And here is the new billing dashboard..."</Text>
            </div>
          </div>

          {/* Timeline */}
          <div style={{ height: isMobile ? 180 : 280, borderTop: '1px solid #303030', background: '#141414', display: 'flex', flexDirection: 'column' }}>
            {/* Timeline Controls */}
            <div style={{ padding: '8px 16px', borderBottom: '1px solid #303030', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space size="small">
                <Button icon={<StepBackwardOutlined />} type="text" size="small" />
                <Button icon={<PlayCircleOutlined />} type="text" size="middle" />
                <Button icon={<StepForwardOutlined />} type="text" size="small" />
                <Text style={{ fontFamily: 'monospace', fontSize: 12, marginLeft: 8 }}>00:12 / {selectedProject?.duration}</Text>
              </Space>
              {!isMobile && (
                <Space>
                   <Text type="secondary" style={{ fontSize: 12 }}>Zoom</Text>
                   <Slider defaultValue={50} style={{ width: 80, margin: 0 }} />
                </Space>
              )}
            </div>
            
            {/* Tracks Area */}
            <div style={{ flex: 1, padding: '8px 0', overflowY: 'auto', position: 'relative' }}>
              {/* Playhead Line */}
              <div style={{ position: 'absolute', left: '25%', top: 0, bottom: 0, width: 2, background: '#177ddc', zIndex: 10 }}></div>

              <div style={{ display: 'flex', marginBottom: 8 }}>
                <div style={{ width: isMobile ? 60 : 80, padding: '0 8px', color: '#888', fontSize: 10, display: 'flex', alignItems: 'center' }}>Video</div>
                <div style={{ flex: 1, position: 'relative', height: 32, background: '#1f1f1f', borderRadius: 4, marginRight: 16 }}>
                  <div style={{ position: 'absolute', left: '0%', width: '30%', height: '100%', background: '#237804', borderRadius: 4, border: '1px solid #389e0d', padding: 4, overflow: 'hidden' }}>
                    <Text style={{ fontSize: 10 }}>Scene 1</Text>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex' }}>
                <div style={{ width: isMobile ? 60 : 80, padding: '0 8px', color: '#888', fontSize: 10, display: 'flex', alignItems: 'center' }}>Audio</div>
                <div style={{ flex: 1, position: 'relative', height: 32, background: '#1f1f1f', borderRadius: 4, marginRight: 16 }}>
                  <div style={{ position: 'absolute', left: '5%', width: '20%', height: '100%', background: '#0958d9', borderRadius: 4, border: '1px solid #1677ff', padding: 4, overflow: 'hidden' }}>
                    <Text style={{ fontSize: 10 }}>VO 1</Text>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar (Inspector/Assets) */}
        <div style={{ width: isMobile ? '100%' : 300, borderLeft: isMobile ? 'none' : '1px solid #303030', borderTop: isMobile ? '1px solid #303030' : 'none', background: '#141414', overflowY: 'auto' }}>
          <Tabs 
            defaultActiveKey="1" 
            centered
            items={[
              {
                key: '1',
                label: 'Inspector',
                children: (
                  <div style={{ padding: '0 16px 16px' }}>
                    <Form layout="vertical" size="small">
                      <Form.Item label="Clip Name">
                        <Input defaultValue="Billing Navigation" />
                      </Form.Item>
                      <Form.Item label="Speed">
                        <Select defaultValue="1x">
                          <Select.Option value="1x">1x</Select.Option>
                          <Select.Option value="2x">2x</Select.Option>
                        </Select>
                      </Form.Item>
                      <Divider style={{ margin: '12px 0' }} />
                      <Title level={5} style={{ fontSize: 14 }}>Voice Settings</Title>
                      <Form.Item label="Profile">
                        <Select defaultValue="alloy">
                          <Select.Option value="alloy">Alloy</Select.Option>
                        </Select>
                      </Form.Item>
                    </Form>
                  </div>
                )
              },
              {
                key: '2',
                label: 'Assets',
                children: (
                  <div style={{ padding: '16px', textAlign: 'center' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Upload assets here.</Text>
                    <Button block size="small" style={{ marginTop: 12 }}>Upload</Button>
                  </div>
                )
              }
            ]} 
          />
        </div>
      </div>
    </Content>
  );

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorPrimary: '#1677ff', borderRadius: 8 } }}>
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
            height: '100%'
          }}
        >
          <div style={{ padding: '24px 16px', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 12 }}>
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #1677ff, #722ed1)', borderRadius: 8, flexShrink: 0 }}></div>
            <Title level={4} style={{ margin: 0, whiteSpace: 'nowrap', opacity: collapsed ? 0 : 1, transition: 'opacity 0.2s' }}>AgentDemo.ai</Title>
          </div>
          <Menu
            mode="inline"
            selectedKeys={[currentView === 'editor' ? 'dashboard' : currentView]}
            style={{ background: 'transparent', borderRight: 0 }}
            items={[
              { key: 'dashboard', icon: <AppstoreOutlined />, label: 'Dashboard', onClick: () => { setCurrentView('dashboard'); if(isMobile) setCollapsed(true); } },
              { key: 'create', icon: <PlusOutlined />, label: 'New Video', onClick: () => { setCurrentView('create'); if(isMobile) setCollapsed(true); } },
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
            {collapsed && <div style={{ marginLeft: 16, fontWeight: 600, transition: 'opacity 0.3s' }}>AgentDemo.ai</div>}
          </Header>
          {currentView === 'dashboard' && renderDashboard()}
          {currentView === 'create' && renderCreate()}
          {currentView === 'editor' && renderEditor()}
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}

export default App;
