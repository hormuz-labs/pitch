import { Layout, Typography, Button, Space, Tag, Slider, Tabs, Form, Input, Divider } from 'antd';
import { 
  SettingOutlined, 
  ExportOutlined, 
  PlayCircleOutlined, 
  StepBackwardOutlined, 
  StepForwardOutlined 
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import type { Project, LogEntry } from '../types';

const { Content } = Layout;
const { Title, Text } = Typography;

interface EditorViewProps {
  projects: Project[];
  jobLogs: Record<string, LogEntry[]>;
  isMobile: boolean;
}

export const EditorView = ({ projects, jobLogs, isMobile }: EditorViewProps) => {
  const navigate = useNavigate();
  const { id } = useParams();
  
  const selectedProject = projects.find(p => p.id === id);
  const logs = jobLogs[id || ''] || [];
  const latestScreenshot = [...logs].reverse().find(l => l.screenshot)?.screenshot;

  if (!selectedProject) {
    return (
      <div style={{ padding: 48, textAlign: 'center', flex: 1, color: '#fff' }}>
        <Title level={4}>Project not found or loading...</Title>
        <Button onClick={() => navigate('/dashboard')}>Back to Dashboard</Button>
      </div>
    );
  }

  return (
    <Content style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Editor Header */}
      <div style={{ padding: '12px 24px', borderBottom: '1px solid #303030', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#141414', zIndex: 10 }}>
        <Space>
          <Button onClick={() => navigate('/dashboard')}>Exit</Button>
          {!isMobile && <Title level={5} style={{ margin: 0, marginLeft: 16 }}>{selectedProject?.parameters?.url || 'Untitled Project'}</Title>}
          {selectedProject.status === 'PROCESSING' && <Tag color="processing">Processing...</Tag>}
        </Space>
        <Space>
          <Button icon={<SettingOutlined />} />
          <Button type="primary" icon={<ExportOutlined />} disabled={selectedProject.status !== 'COMPLETED'}>Export</Button>
        </Space>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: isMobile ? 'column' : 'row' }}>
        {/* Main Work Area (Player + Timeline) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          
          {/* Video Player or Live Preview */}
          <div style={{ flex: 1, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: isMobile ? 200 : 300 }}>
            {selectedProject.status === 'COMPLETED' && selectedProject.videoUrl ? (
              <video src={selectedProject.videoUrl} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : selectedProject.status === 'PROCESSING' && latestScreenshot ? (
              <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <img src={latestScreenshot} style={{ maxWidth: '90%', maxHeight: '80%', border: '1px solid #333', boxShadow: '0 0 20px rgba(0,0,0,0.5)' }} alt="Live Capture" />
                <div style={{ marginTop: 16, color: '#1677ff', animation: 'pulse 2s infinite' }}>
                  <PlayCircleOutlined spin style={{ marginRight: 8 }} />
                  Live Capture in Progress...
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <PlayCircleOutlined style={{ fontSize: isMobile ? 48 : 64, color: '#555', cursor: 'pointer' }} />
                <div style={{ marginTop: 16, color: '#555' }}>
                  {selectedProject.status === 'PROCESSING' ? 'Initializing Agent...' : 'Preview'}
                </div>
              </div>
            )}
          </div>

          {/* Timeline */}
          <div style={{ height: isMobile ? 180 : 280, borderTop: '1px solid #303030', background: '#141414', display: 'flex', flexDirection: 'column' }}>
            {/* Timeline Controls */}
            <div style={{ padding: '8px 16px', borderBottom: '1px solid #303030', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space size="small">
                <Button icon={<StepBackwardOutlined />} type="text" size="small" />
                <Button icon={<PlayCircleOutlined />} type="text" size="middle" />
                <Button icon={<StepForwardOutlined />} type="text" size="small" />
                <Text style={{ fontFamily: 'monospace', fontSize: 12, marginLeft: 8 }}>00:00 / --:--</Text>
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
              <div style={{ display: 'flex', marginBottom: 8 }}>
                <div style={{ width: isMobile ? 60 : 80, padding: '0 8px', color: '#888', fontSize: 10, display: 'flex', alignItems: 'center' }}>Video</div>
                <div style={{ flex: 1, position: 'relative', height: 32, background: '#1f1f1f', borderRadius: 4, marginRight: 16 }}>
                  {selectedProject.status === 'COMPLETED' && (
                    <div style={{ position: 'absolute', left: '0%', width: '100%', height: '100%', background: '#237804', borderRadius: 4, border: '1px solid #389e0d', padding: 4, overflow: 'hidden' }}>
                      <Text style={{ fontSize: 10 }}>Rendered Clip</Text>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex' }}>
                <div style={{ width: isMobile ? 60 : 80, padding: '0 8px', color: '#888', fontSize: 10, display: 'flex', alignItems: 'center' }}>Audio</div>
                <div style={{ flex: 1, position: 'relative', height: 32, background: '#1f1f1f', borderRadius: 4, marginRight: 16 }}>
                  {selectedProject.status === 'COMPLETED' && (
                    <div style={{ position: 'absolute', left: '0%', width: '100%', height: '100%', background: '#0958d9', borderRadius: 4, border: '1px solid #1677ff', padding: 4, overflow: 'hidden' }}>
                      <Text style={{ fontSize: 10 }}>AI Narration</Text>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar (Inspector/Logs) */}
        <div style={{ width: isMobile ? '100%' : 350, borderLeft: isMobile ? 'none' : '1px solid #303030', borderTop: isMobile ? '1px solid #303030' : 'none', background: '#141414', overflowY: 'auto' }}>
          <Tabs 
            defaultActiveKey={selectedProject.status === 'PROCESSING' ? '3' : '1'} 
            centered
            items={[
              {
                key: '1',
                label: 'Inspector',
                children: (
                  <div style={{ padding: '0 16px 16px' }}>
                    <Form layout="vertical" size="small">
                      <Form.Item label="Target URL">
                        <Input value={selectedProject.parameters?.url} readOnly />
                      </Form.Item>
                      <Form.Item label="Instructions">
                        <Input.TextArea value={selectedProject.parameters?.instructions} readOnly autoSize={{ minRows: 2, maxRows: 6 }} />
                      </Form.Item>
                      <Divider style={{ margin: '12px 0' }} />
                      <Title level={5} style={{ fontSize: 14 }}>Project Info</Title>
                      <Text type="secondary" style={{ fontSize: 12 }}>Created: {new Date(selectedProject.createdAt).toLocaleString()}</Text>
                    </Form>
                  </div>
                )
              },
              {
                key: '2',
                label: 'Assets',
                children: (
                  <div style={{ padding: '16px', textAlign: 'center' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Assets will appear here once generated.</Text>
                  </div>
                )
              },
              {
                key: '3',
                label: 'Live Logs',
                children: (
                  <div style={{ padding: '0 12px 12px', height: 'calc(100vh - 160px)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ flex: 1, overflowY: 'auto', background: '#000', borderRadius: 4, padding: 8, fontFamily: 'monospace', fontSize: 11 }}>
                      {logs.length === 0 && <div style={{ color: '#555' }}>Waiting for agent...</div>}
                      {logs.map((log, i) => (
                        <div key={i} style={{ marginBottom: 4, borderBottom: '1px solid #1f1f1f', paddingBottom: 4 }}>
                          <span style={{ color: '#1677ff' }}>[{log.timestamp}]</span>{' '}
                          <span style={{ color: log.type === 'call' ? '#b7eb8f' : log.type === 'text' ? '#fff' : '#888' }}>
                            {log.message}
                          </span>
                          {log.screenshot && (
                            <div style={{ marginTop: 4, border: '1px solid #333' }}>
                              <img src={log.screenshot} style={{ width: '100%', cursor: 'pointer' }} onClick={() => window.open(log.screenshot)} alt="Step Screenshot" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }
            ]} 
          />
        </div>
      </div>
    </Content>
  );
};
