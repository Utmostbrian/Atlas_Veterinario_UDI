import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { TABS } from '../../data/tabs'
import { useAuth } from '../../context/AuthContext'

export default function TabBar({ activeTab, onTabChange }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const ref = useRef(null)

  const visibleTabs = user
    ? TABS.filter(tab => tab.roles.includes(user.role))
    : TABS.filter(tab => tab.roles.includes('student'))

  function handleClick(id) {
    onTabChange(id)
    navigate(`/${id}`)
    const el = ref.current?.querySelector(`[data-tab="${id}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }

  return (
    <div className="tabbar">
      <div className="tabinner" ref={ref}>
        {visibleTabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            data-tab={id}
            className={`tbtn${activeTab === id ? ' on' : ''}`}
            onClick={() => handleClick(id)}
          >
            <Icon size={15} style={{ marginRight: 6, verticalAlign: 'middle', flexShrink: 0 }} />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
