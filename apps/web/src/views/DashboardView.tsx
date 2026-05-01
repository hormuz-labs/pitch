import { Layout, Typography, Button, Row, Col, Card, Space, Tag } from 'antd';
import { 
  PlusOutlined, 
  VideoCameraOutlined, 
  CheckCircleOutlined, 
  ClockCircleOutlined 
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { Project } from '../types';

const { Content } = Layout;
const { Title, Text } = Typography;

interface DashboardViewProps {
  projects: Project[];
  isMobile: boolean;
  onDelete: (e: React.MouseEvent, id: string) => void;
}

export const DashboardView = ({ projects, isMobile, onDelete }: DashboardViewProps) => {
  const navigate = useNavigate();

  const handleCreateNew = () => navigate('/new');
  const handleOpenEditor = (project: Project) => navigate(`/editor/${project.id}`);

  return (
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
        {projects.length === 0 && (
          <Col span={24}>
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#666' }}>
              <VideoCameraOutlined style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }} />
              <p>No videos yet. Create one to get started.</p>
            </div>
          </Col>
        )}
        {projects.map(project => (
          <Col xs={24} sm={12} lg={8} xl={6} key={project.id}>
            <Card
              hoverable
              onClick={() => handleOpenEditor(project)}
              cover={
                <div style={{ height: 160, background: '#141414', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #303030', position: 'relative' }}>
                  {project.status === 'COMPLETED' && project.videoUrl ? (
                     <video src={project.videoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <VideoCameraOutlined style={{ fontSize: 48, color: '#424242' }} />
                  )}
                  {project.status === 'FAILED' && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Text type="danger">Failed</Text>
                    </div>
                  )}
                </div>
              }
              actions={[
                <Button type="link" onClick={(e) => { e.stopPropagation(); handleOpenEditor(project); }}>Edit</Button>,
                <Button type="link" danger onClick={(e) => onDelete(e, project.id)}>Delete</Button>
              ]}
            >
              <Card.Meta 
                title={project.parameters?.url || 'Untitled Job'} 
                description={
                  <Space direction="vertical" size={2} style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                      {project.status === 'COMPLETED' ? (
                        <Tag icon={<CheckCircleOutlined />} color="success">Ready</Tag>
                      ) : project.status === 'FAILED' ? (
                        <Tag color="error">Failed</Tag>
                      ) : (
                        <Tag icon={<ClockCircleOutlined />} color="processing">{project.status}</Tag>
                      )}
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(project.createdAt).toLocaleDateString()}
                      </Text>
                    </div>
                  </Space>
                } 
              />
            </Card>
          </Col>
        ))}
      </Row>
    </Content>
  );
};
