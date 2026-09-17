/**
 * Project and Task Service for AuraTrack Desktop
 */

const { supabase } = require('../config/supabase');
const { logger } = require('../utils/logger');

class ProjectService {
  async fetchProjectsForUser(userId) {
    if (!userId) return [];

    try {
      logger.info('Fetching assigned projects for user:', userId);

      // 1. Get project memberships
      const { data: memberships, error: memError } = await supabase
        .from('project_members')
        .select('project_id')
        .eq('user_id', userId);

      let projectIds = [];
      if (memberships && !memError) {
        projectIds = memberships.map(m => m.project_id);
      }

      // 2. Fetch projects
      let query = supabase.from('projects').select('id, name, description, status, color');

      if (projectIds.length > 0) {
        query = query.in('id', projectIds);
      } else {
        // If no explicit assignments, check if user is admin or load active public projects
        query = query.eq('status', 'active');
      }

      const { data: projects, error } = await query;
      if (error) throw error;

      return (projects || []).filter(p => p.status === 'active' || !p.status);
    } catch (err) {
      logger.error('Error fetching projects:', err);
      return [];
    }
  }

  async fetchTasksForProject(projectId = null) {
    try {
      logger.info('Fetching tasks for project:', projectId || 'all');

      let query = supabase.from('tasks').select('id, project_id, name, description, status');

      if (projectId) {
        query = query.eq('project_id', projectId);
      }

      const { data: tasks, error } = await query;
      if (error) throw error;

      return tasks || [];
    } catch (err) {
      logger.error('Error fetching tasks:', err);
      return [];
    }
  }
}

module.exports = new ProjectService();
