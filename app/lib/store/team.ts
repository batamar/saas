import { observable, action, IObservableArray, runInAction } from 'mobx';
import Router from 'next/router';

import {
  getTeamMembers,
  getTeamInvitedUsers,
  addTopic,
  deleteTopic,
  inviteMember,
  removeMember,
  updateTeam,
} from '../api/team-leader';

import { getTopicList } from '../api/team-member';

import { Topic } from './topic';
import { User } from './user';
import { Invitation } from './invitation';
import { Store } from './index';
// import invitation from 'pages/invitation';

export class Team {
  store: Store;

  @observable private isLoadingTopics = false;
  @observable isInitialTopicsLoaded = false;

  _id: string;
  teamLeaderId: string;

  @observable slug: string;
  @observable name: string;
  @observable avatarUrl: string;
  @observable memberIds: string[];
  @observable topics: IObservableArray<Topic> = <IObservableArray>[];
  @observable privateTopics: IObservableArray<Topic> = <IObservableArray>[];
  @observable currentTopic?: Topic;

  @observable currentTopicSlug?: string;
  @observable currentDiscussionSlug?: string;

  @observable members: Map<string, User> = new Map();
  @observable invitedUsers: Map<string, Invitation> = new Map();
  @observable private isLoadingMembers = false;
  @observable private isInitialMembersLoaded = false;

  constructor(params) {
    Object.assign(this, params);

    if (params.initialTopics) {
      this.setInitialTopics(params.initialTopics);
    }

    if (params.initialMembers) {
      this.setInitialMembers(params.initialMembers, params.initialInvitations);
    }
  }

  @action
  async edit({ name, avatarUrl }: { name: string; avatarUrl: string }) {
    try {
      const { slug } = await updateTeam({
        teamId: this._id,
        name,
        avatarUrl,
      });

      runInAction(() => {
        this.name = name;
        this.slug = slug;
        this.avatarUrl = avatarUrl;
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  @action
  setInitialTopics(topics: any[]) {
    this.topics.clear();

    const topicObjs = topics.map(t => new Topic({ team: this, store: this.store, ...t }));

    this.topics.replace(topicObjs);

    if (this.currentTopicSlug) {
      this.setCurrentTopic(this.currentTopicSlug);
    }

    this.isInitialTopicsLoaded = true;
  }

  @action
  async loadInitialTopics() {
    if (this.isLoadingTopics || this.isInitialTopicsLoaded) {
      return;
    }

    this.isLoadingTopics = true;

    try {
      const { topics = [] } = await getTopicList(this._id);
      const topicObjs = topics.map(t => new Topic({ team: this, store: this.store, ...t }));

      runInAction(() => {
        this.topics.replace(topicObjs);

        if (this.currentTopicSlug) {
          this.setCurrentTopic(this.currentTopicSlug);
        }

        this.isLoadingTopics = false;
        this.isInitialTopicsLoaded = true;
      });
    } catch (error) {
      runInAction(() => {
        this.isLoadingTopics = false;
      });

      throw error;
    }
  }

  @action
  setCurrentTopicAndDiscussion({
    topicSlug,
    discussionSlug,
  }: {
    topicSlug: string;
    discussionSlug: string;
  }) {
    this.currentTopicSlug = topicSlug;
    this.currentDiscussionSlug = discussionSlug;

    for (let i = 0; i < this.topics.length; i++) {
      const topic = this.topics[i];
      if (topic.slug === topicSlug) {
        topic.setInitialDiscussionSlug(discussionSlug);
        topic.currentDiscussionSlug = discussionSlug;
        topic.loadInitialDiscussions();
        this.currentTopic = topic;
        break;
      }
    }
  }

  @action
  setCurrentTopic(slug: string) {
    let found = false;
    for (let i = 0; i < this.topics.length; i++) {
      const topic = this.topics[i];
      if (topic.slug === slug) {
        this.currentTopicSlug = slug;
        if (this.currentDiscussionSlug) {
          topic.setInitialDiscussionSlug(this.currentDiscussionSlug);
          topic.currentDiscussionSlug = this.currentDiscussionSlug;
        }

        topic.loadInitialDiscussions().catch(err => console.log(err));
        this.currentTopic = topic;
        found = true;
        break;
      }
    }

    if (!found) {
      this.currentTopic = null;
      this.currentTopicSlug = null;
    }
  }

  @action
  addTopicToLocalCache(data) {
    const topicObj = new Topic({ team: this, store: this.store, ...data });
    this.topics.unshift(topicObj);
  }

  @action
  editTopicFromLocalCache(topicId: string, name: string) {
    const topic = this.topics.find(t => t._id === topicId);
    topic.name = name;
  }

  @action
  removeTopicFromLocalCache(topicId: string) {
    const topic = this.topics.find(t => t._id === topicId);
    this.topics.remove(topic);
  }

  @action
  async addTopic(data) {
    const { topic } = await addTopic({
      teamId: this._id,
      ...data,
    });

    runInAction(() => {
      this.addTopicToLocalCache(topic);

      Router.push(
        `/topics/detail?teamSlug=${this.slug}&topicSlug=${topic.slug}`,
        `/team/${this.slug}/t/${topic.slug}`,
      );
    });
  }

  @action
  async deleteTopic(topicId: string) {
    const topic = this.topics.find(t => t._id === topicId);

    await deleteTopic({
      id: topicId,
    });

    runInAction(() => {
      this.removeTopicFromLocalCache(topicId);

      if (this.store.currentTeam === this && this.currentTopic === topic) {
        if (this.topics.length > 0) {
          Router.push(
            `/topics/detail?teamSlug=${this.slug}&topicSlug=${this.topics[0].slug}`,
            `/team/${this.slug}/t/${this.topics[0].slug}`,
          );
        } else {
          Router.push('/');
          this.currentTopic = null;
          this.currentTopicSlug = null;
        }
      }
    });
  }

  @action
  setInitialMembers(users, invitations) {
    this.members.clear();
    this.invitedUsers.clear();

    for (let i = 0; i < users.length; i++) {
      this.members.set(users[i]._id, new User(users[i]));
    }

    for (let i = 0; i < invitations.length; i++) {
      this.invitedUsers.set(invitations[i]._id, new Invitation(invitations[i]));
    }

    this.isInitialMembersLoaded = true;
  }

  @action
  async loadInitialMembers() {
    if (this.isLoadingMembers || this.isInitialMembersLoaded) {
      return;
    }

    this.isLoadingMembers = true;

    try {
      const { users = [] } = await getTeamMembers(this._id);

      let invitations = [];
      if (this.store.currentUser._id === this.teamLeaderId) {
        invitations = await getTeamInvitedUsers(this._id);
      }

      runInAction(() => {
        for (let i = 0; i < users.length; i++) {
          this.members.set(users[i]._id, new User(users[i]));
        }
        for (let i = 0; i < invitations.length; i++) {
          this.invitedUsers.set(invitations[i]._id, new Invitation(invitations[i]));
        }

        this.isLoadingMembers = false;
      });
    } catch (error) {
      runInAction(() => {
        this.isLoadingMembers = false;
      });

      throw error;
    }
  }

  @action
  async inviteMember(email: string) {
    return await inviteMember({ teamId: this._id, email });
  }

  @action
  async removeMember(userId: string) {
    await removeMember({ teamId: this._id, userId });

    runInAction(() => {
      this.members.delete(userId);
    });
  }
}
